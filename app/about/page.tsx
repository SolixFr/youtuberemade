'use client';

import catalog from '@/data/catalog.json';

export default function AboutPage() {
  return (
    <div className="page-pad about-page" style={{ maxWidth: 860 }}>
      <h1 className="page-title">About Vidora</h1>
      <div className="pad-m">
        <p>Vidora is a video app built with Next.js, React and TypeScript. It runs entirely in your browser: there is no server or account, and your uploads, comments, posts and stories are stored locally.</p>
        <p>It follows the conventions people know from large video platforms: a home feed with topic chips, a watch page with comments and up-next suggestions, a vertical Shorts feed, channels, playlists, search filters and a creator Studio. It also brings back <b>Stories</b>: 7-day posts available to channels with at least 10,000 subscribers.</p>
        <h2 className="sec-head">Credits</h2>
        <ul>
          <li>Icons: <a href="https://fonts.google.com/icons" target="_blank" rel="noopener noreferrer">Material Symbols</a> by Google, Apache License 2.0.</li>
          <li>Typeface: <a href="https://fonts.google.com/specimen/Roboto" target="_blank" rel="noopener noreferrer">Roboto</a> by Google, SIL Open Font License, via Fontsource.</li>
          <li>All demo footage comes from the <a href="https://images.nasa.gov" target="_blank" rel="noopener noreferrer">NASA Image and Video Library</a>. NASA material is generally not subject to copyright in the United States. Its use here does not imply endorsement by NASA. The channels (Low Orbit, Solar Cycle, Pad 39, Far Light), their subscriber counts and the viewer comments are fictional.</li>
        </ul>
        <h2 className="sec-head">Source clips</h2>
        <ul>
          {catalog.map((c) => (
            <li key={c.id}>
              {c.title} — from <a href={`https://images.nasa.gov/details/${encodeURIComponent(c.nasaId)}`} target="_blank" rel="noopener noreferrer">{c.nasaTitle}</a> ({c.center}, {c.nasaDate}){c.start ? `, starting at ${c.start}s` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
