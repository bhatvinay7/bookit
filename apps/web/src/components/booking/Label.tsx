export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>
      {children}
    </label>
  );
}
