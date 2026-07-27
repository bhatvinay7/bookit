"use client";

import { useState, useEffect } from "react";
import type {
  ShowType, Show, PerformerInfo, TeamInfo
} from "@/types";
import UploadField from "@/app/admin/dashboard/components/UploadField";
import FormField from "@/app/admin/dashboard/components/FormField";

// Local CastMember (role optional to match show.ts)
interface CastMemberLocal {
  name: string;
  photo_url: string;
  role?: string;
  display_order?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TagEditor({
  tags, onChange
}: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !tags.includes(t)) { onChange([...tags, t]); }
    setInput("");
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {tags.map(t => (
          <span key={t} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 10px", background: "var(--accent-light)", borderRadius: 20,
            fontSize: 12, color: "var(--accent)",
          }}>
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, color: "var(--accent)" }}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input className="admin-input" style={{ flex: 1 }}
          placeholder="Add tag and press Enter"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <button className="btn btn-ghost btn-sm" type="button" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function CastEditorLocal({
  cast, onChange
}: { cast: CastMemberLocal[]; onChange: (cast: CastMemberLocal[]) => void; token?: string }) {
  const add = () => onChange([...cast, { name: "", photo_url: "", role: "", display_order: cast.length }]);
  const update = (i: number, key: keyof CastMemberLocal, val: string) => {
    const next = [...cast];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };
  const remove = (i: number) => onChange(cast.filter((_, j) => j !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cast.map((c, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "flex-end" }}>
          <div>
            <label className="admin-label">Name *</label>
            <input className="admin-input" value={c.name} onChange={e => update(i, "name", e.target.value)} placeholder="Cast name" />
          </div>
          <div>
            <label className="admin-label">Role</label>
            <input className="admin-input" value={c.role ?? ""} onChange={e => update(i, "role", e.target.value)} placeholder="Actor / Villain" />
          </div>
          <div>
            <label className="admin-label">Upload Photo *</label>
            <UploadField label="Photo" value={c.photo_url} onChange={v => update(i, "photo_url", v)} accept="image/*" />
          </div>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => remove(i)} style={{ height: 36 }}>✕</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" type="button" onClick={add} style={{ alignSelf: "flex-start" }}>+ Cast Member</button>
    </div>
  );
}

function PerformerEditorLocal({
  performers, onChange
}: { performers: PerformerInfo[]; onChange: (p: PerformerInfo[]) => void }) {
  const add = () => onChange([...performers, { name: "", role: "" }]);
  const update = (i: number, key: keyof PerformerInfo, val: string) => {
    const next = [...performers];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };
  const remove = (i: number) => onChange(performers.filter((_, j) => j !== i));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {performers.map((p, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "flex-end" }}>
          <div>
            <label className="admin-label">Name *</label>
            <input className="admin-input" value={p.name} onChange={e => update(i, "name", e.target.value)} placeholder="Performer name" />
          </div>
          <div>
            <label className="admin-label">Role</label>
            <input className="admin-input" value={p.role ?? ""} onChange={e => update(i, "role", e.target.value)} placeholder="Vocalist / Speaker" />
          </div>
          <div>
            <label className="admin-label">Upload Photo</label>
            <UploadField label="Photo" value={p.photo_url ?? ""} onChange={v => update(i, "photo_url", v)} accept="image/*" />
          </div>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => remove(i)} style={{ height: 36 }}>✕</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" type="button" onClick={add} style={{ alignSelf: "flex-start" }}>+ Performer</button>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ShowFormProps {
  initial?: Partial<Show>;
  token: string;
  onSubmit: (data: Partial<Show>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

// ─── Main Form ────────────────────────────────────────────────────────────────

const SHOW_TYPES: ShowType[] = ["Movie", "Concert", "Event", "GameEvent"];
const STATUS_OPTIONS = ["comingSoon", "nowShowing", "ended", "cancelled"];
const INDIAN_CITIES = [
  "Mumbai", "Bengaluru", "Delhi-NCR", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Chandigarh", "Kochi",
  "Lucknow", "Indore", "Surat", "Nagpur", "Bhopal", "Visakhapatnam",
  "Patna", "Vadodara", "Ludhiana"
];

export default function ShowForm({ initial, token, onSubmit, onCancel, isLoading }: ShowFormProps) {
  const [showType, setShowType] = useState<ShowType>(initial?.show_type ?? "Movie");
  const [form, setForm] = useState({
    title:              initial?.title ?? "",
    description:        initial?.description ?? "",
    language:           initial?.language ?? "",
    genre:              initial?.genre?.join(", ") ?? "",
    score:              initial?.score?.toString() ?? "",
    weight:             initial?.weight?.toString() ?? "0",
    status:             initial?.status ?? "comingSoon",
    duration_minutes:   initial?.duration_minutes?.toString() ?? "",
    // Media
    poster_url:         initial?.poster_url ?? "",
    backdrop_url:       initial?.backdrop_url ?? "",
    thumbnail_url:      initial?.thumbnail_url ?? "",
    trailer_url:        initial?.trailer_url ?? "",
    teaser_url:         initial?.teaser_url ?? "",
    // Movie
    director:           initial?.director ?? "",
    director_photo_url: initial?.director_photo_url ?? "",
    // Concert/Event
    host:               initial?.host ?? "",
    host_photo_url:     initial?.host_photo_url ?? "",
    // GameEvent
    sport:              initial?.sport ?? "",
    venue:              initial?.venue ?? "",
    match_round:        initial?.match_round ?? "",
    team_a_name:        initial?.team_a?.name ?? "",
    team_a_logo:        initial?.team_a?.logo_url ?? "",
    team_b_name:        initial?.team_b?.name ?? "",
    team_b_logo:        initial?.team_b?.logo_url ?? "",
    // Location
    city:               initial?.city ?? "",
  });

  const [tags,       setTags]       = useState<string[]>(initial?.tags ?? []);
  const [cast,       setCast]       = useState<CastMemberLocal[]>(initial?.cast?.map(c => ({ ...c, role: c.role ?? undefined })) ?? []);
  const [performers, setPerformers] = useState<PerformerInfo[]>(initial?.performers ?? []);

  const [availableCities, setAvailableCities] = useState<string[]>(INDIAN_CITIES);

  useEffect(() => {
    const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8082";
    Promise.all([
      fetch(`${api}/api/user/cities`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${api}/api/admin/cities`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([userCities, adminCities]) => {
      const merged = Array.from(
        new Set([
          ...INDIAN_CITIES,
          ...(Array.isArray(userCities) ? userCities : []),
          ...(Array.isArray(adminCities) ? adminCities : []),
        ])
      ).sort((a, b) => a.localeCompare(b));
      setAvailableCities(merged);
    });
  }, []);

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<Show> = {
      show_type:        showType,
      title:            form.title,
      description:      form.description || undefined,
      language:         form.language || undefined,
      genre:            form.genre ? form.genre.split(",").map(g => g.trim()).filter(Boolean) : [],
      score:            form.score ? Number(form.score) : undefined,
      weight:           form.weight ? Number(form.weight) : 0,
      status:           form.status as Show["status"],
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
      city:             form.city || undefined,
      tags,
      poster_url:    form.poster_url || undefined,
      backdrop_url:  form.backdrop_url || undefined,
      thumbnail_url: form.thumbnail_url || undefined,
      trailer_url:   form.trailer_url || undefined,
      teaser_url:    form.teaser_url || undefined,
    };

    if (showType === "Movie") {
      payload.director           = form.director || undefined;
      payload.director_photo_url = form.director_photo_url || undefined;
      payload.cast               = cast;
    } else if (showType === "Concert" || showType === "Event") {
      payload.host            = form.host || undefined;
      payload.host_photo_url  = form.host_photo_url || undefined;
      payload.performers      = performers;
    } else if (showType === "GameEvent") {
      payload.sport       = form.sport || undefined;
      payload.venue       = form.venue || undefined;
      payload.match_round = form.match_round || undefined;
      if (form.team_a_name) payload.team_a = { name: form.team_a_name, logo_url: form.team_a_logo || undefined };
      if (form.team_b_name) payload.team_b = { name: form.team_b_name, logo_url: form.team_b_logo || undefined };
    }
    await onSubmit(payload);
  };



  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Show Type Selector ─────────────────────────────────────────────── */}
      <div>
        <label className="admin-label">Show Type (System Partition) *</label>
        <div style={{ display: "flex", gap: 8 }}>
          {SHOW_TYPES.map(t => (
            <button key={t} type="button"
              className={`btn ${showType === t ? "btn-primary" : "btn-ghost"} btn-sm`}
              onClick={() => setShowType(t)}
            >
              {t === "Movie" ? "🎬" : t === "Concert" ? "🎵" : t === "Event" ? "🎪" : "🏟️"} {t}
            </button>
          ))}
        </div>
      </div>



      {/* ── Common Fields ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <FormField label="Title" value={form.title} onChange={v => set("title", v)} required autoFocus placeholder="Show title" />
        <div>
          <label className="admin-label">Status</label>
          <select className="admin-input" value={form.status} onChange={e => set("status", e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <FormField label="Language" value={form.language} onChange={v => set("language", v)} placeholder="Hindi, English…" />
        <div>
          <label className="admin-label">City</label>
          <select className="admin-input" value={form.city} onChange={e => set("city", e.target.value)}>
            <option value="">Any / Nationwide (All Cities)</option>
            {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <FormField label="Genre (comma separated)" value={form.genre} onChange={v => set("genre", v)} placeholder="Action, Drama…" />
        {showType !== "GameEvent" && (
          <FormField label="Duration (minutes)" value={form.duration_minutes} onChange={v => set("duration_minutes", v)} type="number" placeholder="120" />
        )}
        <div style={{ flex: 1 }}>
          <FormField label="Score (0-10)" type="number"
            value={form.score} onChange={v => set("score", v)} placeholder="e.g. 8.5" />
        </div>
        <div style={{ flex: 1 }}>
          <FormField label="Weight (Marketing Priority)" type="number"
            value={form.weight} onChange={v => set("weight", v)} placeholder="e.g. 10" />
        </div>
      </div>

      <div>
        <label className="admin-label">Description</label>
        <textarea className="admin-input" rows={3} placeholder="Short description…"
          value={form.description} onChange={e => set("description", e.target.value)}
          style={{ resize: "vertical" }} />
      </div>

      <div>
        <label className="admin-label">Tags</label>
        <TagEditor tags={tags} onChange={setTags} />
      </div>

      {/* ── Media ─────────────────────────────────────────────────────────── */}
      <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
        <legend style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", padding: "0 6px" }}>
          Media
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label className="admin-label">Poster</label>
            <UploadField label="Poster" value={form.poster_url} onChange={v => set("poster_url", v)} accept="image/*" />
          </div>
          <div>
            <label className="admin-label">Backdrop</label>
            <UploadField label="Backdrop" value={form.backdrop_url} onChange={v => set("backdrop_url", v)} accept="image/*" />
          </div>
          <div>
            <label className="admin-label">Thumbnail</label>
            <UploadField label="Thumbnail" value={form.thumbnail_url} onChange={v => set("thumbnail_url", v)} accept="image/*" />
          </div>
          <FormField label="Trailer URL (optional)" value={form.trailer_url} onChange={v => set("trailer_url", v)} placeholder="https://youtube.com/..." />
          <FormField label="Teaser URL (optional)" value={form.teaser_url} onChange={v => set("teaser_url", v)} placeholder="https://youtube.com/..." />
        </div>
      </fieldset>

      {/* ── Type-specific fields ───────────────────────────────────────────── */}
      {showType === "Movie" && (
        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", padding: "0 6px" }}>🎬 Movie</legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <FormField label="Director Name *" value={form.director} onChange={v => set("director", v)} required placeholder="Christopher Nolan" />
            <div>
              <label className="admin-label">Director Photo *</label>
              <UploadField label="Director Photo" value={form.director_photo_url} onChange={v => set("director_photo_url", v)} accept="image/*" />
            </div>
          </div>
          <label className="admin-label">Cast *</label>
          <CastEditorLocal cast={cast} onChange={setCast} token={token} />
        </fieldset>
      )}

      {(showType === "Concert" || showType === "Event") && (
        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", padding: "0 6px" }}>
            {showType === "Concert" ? "🎵 Concert" : "🎪 Event"}
          </legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <FormField label="Host Name *" value={form.host} onChange={v => set("host", v)} required placeholder="Artist / Event Host" />
            <div>
              <label className="admin-label">Host Photo</label>
              <UploadField label="Host Photo" value={form.host_photo_url} onChange={v => set("host_photo_url", v)} accept="image/*" />
            </div>
          </div>
          <label className="admin-label">Performers / Speakers</label>
          <PerformerEditorLocal performers={performers} onChange={setPerformers} />
        </fieldset>
      )}

      {showType === "GameEvent" && (
        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px" }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", padding: "0 6px" }}>🏟️ Game Event</legend>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
            <FormField label="Sport *" value={form.sport} onChange={v => set("sport", v)} required placeholder="Kabaddi, Cricket, Football…" />
            <FormField label="Venue *" value={form.venue} onChange={v => set("venue", v)} required placeholder="Stadium / Arena name" />
            <FormField label="Round" value={form.match_round} onChange={v => set("match_round", v)} placeholder="Quarter Final, League…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Team A *</p>
              <FormField label="Team A Name" value={form.team_a_name} onChange={v => set("team_a_name", v)} required placeholder="Team name" />
              <div style={{ marginTop: 8 }}>
                <UploadField label="Team A Logo" value={form.team_a_logo} onChange={v => set("team_a_logo", v)} accept="image/*" />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Team B *</p>
              <FormField label="Team B Name" value={form.team_b_name} onChange={v => set("team_b_name", v)} required placeholder="Team name" />
              <div style={{ marginTop: 8 }}>
                <UploadField label="Team B Logo" value={form.team_b_logo} onChange={v => set("team_b_logo", v)} accept="image/*" />
              </div>
            </div>
          </div>
        </fieldset>
      )}

      {/* ── Actions ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="admin-spinner" style={{ width: 14, height: 14 }} /> Saving…
            </span>
          ) : "Save Show"}
        </button>
      </div>
    </form>
  );
}
