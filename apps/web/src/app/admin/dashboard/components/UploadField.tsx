"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface UploadFieldProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  accept?: string;
}

export default function UploadField({ label, value, onChange, accept }: UploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = localStorage.getItem("admin_token") || "";
      const r = await fetch(`${API}/api/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!r.ok) throw new Error(await r.text());
      const data = await r.json() as { url: string };
      onChange(data.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={value} alt="Preview" style={{ height: 40, width: 40, objectFit: "cover", borderRadius: 4, border: "1px solid var(--border)" }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange("")}>Remove</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="file" accept={accept} onChange={handleFileChange} disabled={uploading} style={{ fontSize: 13 }} />
          {uploading && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Uploading…</span>}
        </div>
      )}
      {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
