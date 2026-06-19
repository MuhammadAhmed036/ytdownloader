export function isYouTubeUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      return parsed.pathname.replace(/^\//, "").length >= 8;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      return Boolean(parsed.searchParams.get("v")) || parsed.pathname.startsWith("/shorts/");
    }

    return false;
  } catch {
    return false;
  }
}

export function normalizeYouTubeUrl(value: string): string {
  const parsed = new URL(value.trim());
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const videoId = parsed.pathname.split("/").filter(Boolean)[0];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  if (parsed.pathname.startsWith("/shorts/")) {
    const videoId = parsed.pathname.split("/").filter(Boolean)[1];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  const videoId = parsed.searchParams.get("v");
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : value.trim();
}
