"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@demox-labs/aleo-wallet-adapter-react";
import { WalletMultiButton } from "@demox-labs/aleo-wallet-adapter-reactui";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  Ticket, 
  LayoutDashboard, 
  ScanLine, 
  CreditCard, 
  ShieldCheck, 
  Loader2, 
  Menu, 
  X 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePassMeet } from "@/context/PassMeetContext";
import { toast } from "sonner";

export function Navbar() {
  const pathname = usePathname();
  const { publicKey, disconnect } = useWallet();
  const { isAuthenticated, authenticateWithSignature } = usePassMeet();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    try {
      const success = await authenticateWithSignature();
      if (success) {
        toast.success("Authenticated successfully!");
      } else {
        toast.error("Authentication failed");
      }
    } catch (error) {
      console.error("Auth error:", error);
      toast.error("Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const navItems = [
    { name: "Home", href: "/", icon: Ticket },
    { name: "Organizer", href: "/organizer", icon: LayoutDashboard },
    { name: "My Tickets", href: "/tickets", icon: Ticket },
    { name: "Gate", href: "/gate", icon: ScanLine },
    { name: "Subscription", href: "/subscription", icon: CreditCard },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.5 }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary"
            >
              <Ticket className="h-5 w-5 text-black" />
            </motion.div>
            <span className="text-xl font-bold tracking-tight text-white">PassMeet</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {publicKey ? (
            <div className="flex items-center gap-3">
              {!isAuthenticated && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating}
                  className="hidden sm:flex border-primary/50 text-primary hover:bg-primary/10"
                >
                  {isAuthenticating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Sign to Verify
                </Button>
              )}
              <div className="hidden sm:flex flex-col items-end">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Connected</span>
                  {isAuthenticated && (
                    <ShieldCheck className="h-3 w-3 text-primary" />
                  )}
                </div>
                <span className="text-sm font-medium text-white">
                  {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => disconnect()}
                className="rounded-full bg-white/5 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="wallet-adapter-wrapper">
              <WalletMultiButton />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-white/10 bg-black/95"
          >
            <div className="container mx-auto px-4 py-4 space-y-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
              {publicKey && !isAuthenticated && (
                <Button
                  variant="outline"
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating}
                  className="w-full mt-4 border-primary/50 text-primary hover:bg-primary/10"
                >
                  {isAuthenticating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Sign to Verify Identity
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
