import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-32">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="glow mt-4 font-pixel text-5xl md:text-7xl">Page not found.</h1>
      <p className="mt-4 text-muted-foreground">This page could not be found. Go back to the home page.</p>
      <Button asChild className="mt-8"><Link href="/">Back home</Link></Button>
    </Container>
  );
}
