const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

/**
 * Назви уроків — це імена файлів у Drive. Розширення й «_» замість «:»
 * (Drive не дозволяє двокрапку в імені) читачеві ні до чого.
 */
export function lessonTitle(fileName: string): string {
  return fileName.replace(VIDEO_EXTENSION, '').replace(/_(\s)/g, ':$1').trim();
}
