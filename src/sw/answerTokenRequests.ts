type MessageTarget = {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

/**
 * Сторінкова половина GET_TOKEN: воркер, якого браузер перезапустив і який
 * через це забув токен, питає його тут. Невимушений getToken віддає кешований
 * токен без мережі й без вікна Google; force приходить лише після 401 від Drive.
 */
export function answerTokenRequests(
  target: MessageTarget,
  getToken: (opts: { force: boolean }) => Promise<string>,
): void {
  target.addEventListener('message', (event) => {
    const data = event.data as { type?: string; force?: boolean } | null;
    if (data?.type !== 'GET_TOKEN') return;
    const port = event.ports[0];
    if (!port) return;

    getToken({ force: data.force === true }).then(
      (token) => port.postMessage({ token }),
      () => port.postMessage({ error: true }),
    );
  });
}
