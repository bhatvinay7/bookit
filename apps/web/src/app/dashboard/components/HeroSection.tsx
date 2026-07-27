import { Movie } from "@/types";
import { Star } from "lucide-react";

interface HeroSectionProps {
  featured: Movie | null;
  nowShowing: Movie[];
  featIdx: number;
  setFeatIdx: (idx: number) => void;
  setBookMovie: (movie: Movie) => void;
  dark: boolean;
  css: (v: string) => string;
}

export function HeroSection({ featured, nowShowing, featIdx, setFeatIdx, setBookMovie, dark, css }: HeroSectionProps) {
  if (!featured) {
    return (
      <section style={{ position: 'relative', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ fontFamily: css('font-display'), color: css('text-secondary') }}>No featured movies available</h2>
      </section>
    );
  }

  return (
    <section style={{ position: 'relative', height: '580px', overflow: 'hidden', marginLeft: '-80px', width: 'calc(100% + 80px)' }}>
      {/* Backdrop */}
      <img
        src={featured.backdrop_url || ""}
        alt=""
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', transition: 'opacity 0.4s',
        }}
      />
      {/* Gradient overlay */}
      <div style={{ position: 'absolute', inset: 0, background: css('hero-grad') }} />
      {/* Bottom fade into page bg */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '130px',
          background: `linear-gradient(to bottom, transparent, ${dark ? '#09080f' : '#fafafa'})`,
          zIndex: 1,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative', zIndex: 2, height: '100%',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '0 56px 0 136px', maxWidth: '800px',
        }}
      >
        {/* Now showing pill */}
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: css('accent'), color: '#12111a',
            fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '5px 13px', borderRadius: '20px',
            marginBottom: '20px', width: 'fit-content',
          }}
        >
          <span
            style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: '#12111a', display: 'inline-block',
            }}
          />
          Now Showing
        </div>

        {/* Genre + meta badges */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {(featured.genre || []).map((g: string) => (
            <span
              key={g}
              style={{
                background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                color: css('text-primary'), fontSize: '12px', fontWeight: 600,
                padding: '4px 12px', borderRadius: '20px',
                backdropFilter: 'blur(6px)',
                border: `1px solid ${css('border')}`,
              }}
            >
              {g}
            </span>
          ))}
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: css('accent'), color: '#12111a',
              fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
            }}
          >
            <Star /> {featured.score ? featured.score.toFixed(1) : "0.0"}
          </span>
          <span
            style={{
              background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              color: css('text-primary'), fontSize: '12px', fontWeight: 600,
              padding: '4px 12px', borderRadius: '20px',
            }}
          >
            {featured.duration_minutes} min
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: css('font-display'), fontWeight: 900,
            fontSize: 'clamp(36px, 5vw, 64px)', color: css('text-primary'),
            margin: '0 0 8px', lineHeight: 1.04, letterSpacing: '-0.025em',
          }}
        >
          {featured.title}
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: css('font-display'), fontStyle: 'italic',
            fontSize: '17px', color: css('accent-text'), margin: '0 0 16px',
          }}
        >
          "{featured.tagline}"
        </p>

        {/* Description */}
        <p
          style={{
            color: css('text-secondary'), fontSize: '14px', lineHeight: 1.68,
            margin: '0 0 28px', maxWidth: '480px',
          }}
        >
          {featured.description}
        </p>

        {/* Cast */}
        <div
          style={{
            display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '12px', color: css('text-muted'), fontWeight: 500 }}>Cast:</span>
          {(featured.cast || []).map((member) => (
            <span
              key={member.name}
              style={{
                fontSize: '12px', fontWeight: 600, color: css('text-primary'),
                background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                padding: '3px 10px', borderRadius: '20px',
                border: `1px solid ${css('divider')}`,
              }}
            >
              {member.name}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setBookMovie(featured)}
            style={{
              padding: '14px 32px', background: css('accent'), color: '#12111a',
              border: 'none', borderRadius: '11px', fontWeight: 700, fontSize: '15px',
              cursor: 'pointer', fontFamily: css('font-sans'), letterSpacing: '0.01em',
              transition: 'opacity 0.18s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.87')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            Book Tickets
          </button>
          <button
            style={{
              padding: '14px 24px',
              background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
              color: css('text-primary'),
              border: `1px solid ${css('border')}`,
              borderRadius: '11px', fontWeight: 600, fontSize: '15px',
              cursor: 'pointer', fontFamily: css('font-sans'),
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: '9px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
            Watch Trailer
          </button>
        </div>
      </div>

    </section>
  );
}
