import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { CoursePage } from './ui/CoursePage';
import { LessonPage } from './ui/LessonPage';
import { LibraryPage } from './ui/LibraryPage';
import { AppHeader, Logo, ThemeToggle } from './ui/AppHeader';
import { primaryButton } from './ui/buttons';
import { createServices } from './app/services';
import { createLearnerStore } from './store/useStore';
import type { TokenClient } from './auth/tokenClient';
import type { LearnerState } from './store/useStore';
import type { StoreApi, UseBoundStore } from 'zustand';

type Store = UseBoundStore<StoreApi<LearnerState>>;
type Services = Awaited<ReturnType<typeof createServices>>;

export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [tokenClient, setTokenClient] = useState<TokenClient | null>(null);
  const [refreshToken, setRefreshToken] = useState<(() => Promise<void>) | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  // servicesRef caches the createServices() PROMISE itself (not just a boolean),
  // so React 19 StrictMode's dev-only double-invoke of this effect (mount →
  // cleanup → mount again) cannot start a second call: the second invocation
  // reuses the same in-flight/resolved promise. createServices() attaches a
  // 'controllerchange' listener it never removes, so calling it twice would
  // leak a second listener — this guarantees exactly one call per app lifetime.
  const servicesRef = useRef<Promise<Services> | null>(null);

  useEffect(() => {
    let active = true;
    servicesRef.current ??= createServices();

    servicesRef.current
      .then(({ tokenClient: client, refreshToken: refresh, ...deps }) => {
        if (!active) return;
        setTokenClient(client);
        // Обидва значення — функції, тому обгортка обов'язкова: setState
        // приймає функцію за оновлювач і викликає її. Для стора це означало
        // виклик zustand-хука поза рендером — застосунок падав на порушенні
        // порядку хуків і не проходив далі екрана завантаження.
        setRefreshToken(() => refresh);
        setStore(() => createLearnerStore(deps));
        // Токен, відновлений після перезавантаження, не викликає onChange.
        setSignedIn(client.isSignedIn());
        client.onChange(setSignedIn);
      })
      .catch((cause: unknown) => {
        if (active) setFatal(cause instanceof Error ? cause.message : 'Помилка запуску');
      });

    return () => {
      active = false;
    };
  }, []);

  if (fatal) {
    return <main className="mx-auto max-w-xl p-8 text-danger">{fatal}</main>;
  }

  if (!store || !tokenClient) {
    return <main className="mx-auto max-w-xl p-8 text-muted">Завантаження…</main>;
  }

  return (
    <SignInGate
      store={store}
      tokenClient={tokenClient}
      signedIn={signedIn}
      refreshToken={refreshToken ?? undefined}
    />
  );
}

function SignInGate({
  store,
  tokenClient,
  signedIn,
  refreshToken,
}: {
  store: Store;
  tokenClient: TokenClient;
  signedIn: boolean;
  refreshToken?: () => Promise<void>;
}) {
  const [signingIn, setSigningIn] = useState(false);

  if (!signedIn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-12 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          Відеокурси з Google Drive
        </h1>
        <p className="text-muted">
          Увійдіть через Google, щоб застосунок міг читати папки курсів і зберігати ваш прогрес.
        </p>
        <button
          type="button"
          disabled={signingIn}
          onClick={() => {
            // Без цього прапорця подвійний клік відкриває два діалоги згоди
            // послідовно — signIn() завжди йде за свіжим 'consent' запитом.
            setSigningIn(true);
            void tokenClient.signIn().finally(() => setSigningIn(false));
          }}
          className={`self-start ${primaryButton}`}
        >
          {signingIn ? 'Вхід…' : 'Увійти через Google'}
        </button>
      </main>
    );
  }

  return <SignedInApp store={store} refreshToken={refreshToken} />;
}

function SignedInApp({
  store,
  refreshToken,
}: {
  store: Store;
  refreshToken?: () => Promise<void>;
}) {
  const state = store();

  // init читає сховище й зливає прогрес — рівно один раз за монтування.
  // Порожній список залежностей тут навмисний: state змінюється на кожну дію,
  // і будь-яка залежність від нього перезапускала б init без кінця.
  useEffect(() => {
    void state.init();
  }, []);

  // Дебоунс 10 с не переживає закриття вкладки, а довгоживуча вкладка сама
  // ніколи не дізнається про прогрес з іншого пристрою. Дії беремо через
  // getState(): вони стабільні, тому ефект не залежить від рендеру.
  useEffect(() => {
    const flush = () => void store.getState().flushSync();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void store.getState().syncFromRemote();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [store]);

  if (!state.ready) {
    return <main className="mx-auto max-w-xl p-8 text-muted">Завантаження курсів…</main>;
  }

  return (
    <>
      <AppHeader />
      <Routes>
        <Route
          path="/"
          element={
            <LibraryPage
              courses={state.courses}
              progress={state.progress}
              onAddCourse={async (input) => {
                await state.addCourse(input);
              }}
              onRemoveCourse={(id) => void state.removeCourse(id)}
            />
          }
        />
        <Route path="/course/:courseId" element={<CourseRoute state={state} />} />
        <Route
          path="/course/:courseId/lesson/:videoId"
          element={<LessonRoute state={state} refreshToken={refreshToken} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function CourseRoute({ state }: { state: LearnerState }) {
  const { courseId } = useParams();
  const course = useMemo(
    () => state.courses.find((c) => c.id === courseId),
    [state.courses, courseId],
  );
  if (!course) return <Navigate to="/" replace />;

  return (
    <CoursePage
      course={course}
      progress={state.progress}
      onRescan={() => state.rescanCourse(course.id)}
    />
  );
}

function LessonRoute({
  state,
  refreshToken,
}: {
  state: LearnerState;
  refreshToken?: () => Promise<void>;
}) {
  const { courseId, videoId } = useParams();
  const course = state.courses.find((c) => c.id === courseId);
  if (!course || !videoId) return <Navigate to="/" replace />;

  return (
    <LessonPage
      course={course}
      progress={state.progress}
      videoId={videoId}
      onPosition={(fileId, positionSec, durationSec) =>
        void state.setPosition(fileId, positionSec, durationSec)
      }
      onToggleCompleted={(fileId, completed) => void state.setCompleted(fileId, completed)}
      onRecoverToken={refreshToken}
    />
  );
}
