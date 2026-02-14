import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Ticket, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
        <Ticket className="h-10 w-10 text-primary" />
      </div>
      <h1 className="text-4xl font-bold text-white">404</h1>
      <p className="mt-2 text-muted-foreground">This page could not be found.</p>
      <Button asChild className="mt-8 rounded-full" size="lg">
        <Link href="/">
          <Home className="mr-2 h-4 w-4" />
          Back to Home
        </Link>
      </Button>
    </div>
  );
}
