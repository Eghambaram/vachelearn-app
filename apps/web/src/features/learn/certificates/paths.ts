/** Plain module: used by server and client components alike. */
export const certificateHref = (awardId: string) =>
  `/learn/certificates/${encodeURIComponent(awardId)}`;

export const verificationPath = (verificationId: string) =>
  `/verify/${encodeURIComponent(verificationId)}`;
