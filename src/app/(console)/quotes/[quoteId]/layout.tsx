import { QuoteWorkspaceChrome } from "@/components/console/quote-workspace-chrome";

export default async function QuoteDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <QuoteWorkspaceChrome quoteId={quoteId} />
      {children}
    </div>
  );
}
