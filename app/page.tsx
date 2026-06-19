import Downloader from "@/components/Downloader";

export default function Home() {
  return (
    <main className="page-shell">
      <div className="soft-orb orb-one" />
      <div className="soft-orb orb-two" />

      <header className="topbar" aria-label="Site header">
        <div className="topbar-brand">
          <span className="tiny-logo">▶</span>
          <span>YouTube Downloader</span>
        </div>
        <span className="topbar-chip">MP4 / MP3</span>
      </header>

      <div className="main-grid">
        <Downloader />
      </div>
    </main>
  );
}
