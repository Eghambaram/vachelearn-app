/** The player URL for one lesson of an enrollment. Plain module: used by server and client components alike. */
export const lessonHref = (enrollmentId: string, lessonId: string) =>
  `/learn/courses/${encodeURIComponent(enrollmentId)}/lessons/${encodeURIComponent(lessonId)}`;
