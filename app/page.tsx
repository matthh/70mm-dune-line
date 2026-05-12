import { buildTimeline } from '@/lib/data';
import Timeline from './Timeline';

export default function Page() {
  // Built once at build-time (static export). The Timeline component
  // hydrates this and adds chip-filter + hover-tooltip interactivity.
  const { bands, totals, scrapedAt } = buildTimeline();
  return (
    <div className="stage">
      <div className="hd">
        <div className="logo-row">
          <span className="logo-70">70</span><span className="logo-mm">MM</span>
        </div>
        <div className="divider" />
        <div className="tag-block">
          <p className="tag-line">THE DUNE LINE</p>
          <p className="sub">a chronological investigation · main show only</p>
        </div>
      </div>

      <Timeline bands={bands} totals={totals} />

      <p className="footer">
        main show only · vault excluded · data via{' '}
        <a href="https://70mmwiki.com" rel="noopener noreferrer">70mmwiki.com</a>
        {' · '}
        scraped {new Date(scrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
      </p>
    </div>
  );
}
