/** Bentuknya meniru PlaylistHeader + TrackList agar tidak ada lompatan layout saat data tiba. */
export default function PlaylistSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat playlist…</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-col items-center gap-5 rounded-lg bg-card p-4 sm:flex-row sm:items-end sm:gap-6 sm:p-6">
          <div className="skeleton aspect-square w-44 shrink-0 rounded-md sm:w-48 lg:w-56" />
          <div className="w-full min-w-0 flex-1 space-y-3">
            <div className="skeleton mx-auto h-4 w-16 rounded sm:mx-0" />
            <div className="skeleton mx-auto h-9 w-3/4 rounded sm:mx-0 lg:h-14" />
            <div className="skeleton mx-auto h-4 w-32 rounded sm:mx-0" />
            <div className="flex justify-center gap-3 pt-1 sm:justify-start">
              <div className="skeleton h-11 w-32 rounded-full" />
              <div className="skeleton h-11 w-28 rounded-full" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="skeleton h-11 w-full rounded-full" />
          <ul className="-mx-2 space-y-0.5">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 px-2 py-2">
                <div className="skeleton h-3 w-6 shrink-0 rounded" />
                <div className="skeleton h-12 w-12 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/2 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
                <div className="skeleton hidden h-3 w-10 shrink-0 rounded sm:block" />
                <div className="skeleton h-11 w-11 shrink-0 rounded-full opacity-60" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
