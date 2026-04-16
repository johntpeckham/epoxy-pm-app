export const dynamic = 'force-dynamic'

export default function AdminStandaloneLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This layout intentionally provides no sidebar and no app header.
  // The /admin/command-center page is designed to run in its own pop-out
  // browser window (second monitor) and fills the entire viewport.
  return <div className="min-h-screen w-full">{children}</div>
}
