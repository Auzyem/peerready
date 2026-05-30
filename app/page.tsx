import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-24">
      <h1 className="text-4xl font-bold">PeerReady</h1>
      <p className="text-muted-foreground">
        AI-powered manuscript peer review.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
