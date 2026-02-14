import Link from "next/link";
import { Ticket } from "lucide-react";
import { EXPLORER_BASE } from "@/lib/aleo";

export function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-black py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
              <Ticket className="h-4 w-4 text-black" />
            </div>
            <span className="text-lg font-bold text-white">PassMeet</span>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <Link href="/organizer" className="hover:text-primary transition-colors">Organizer</Link>
            <Link href="/tickets" className="hover:text-primary transition-colors">My Tickets</Link>
            <Link href="/gate" className="hover:text-primary transition-colors">Gate</Link>
            <a href={EXPLORER_BASE} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">View on Explorer</a>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 PassMeet. Built for Aleo Wavehack.
          </p>
        </div>
      </div>
    </footer>
  );
}
