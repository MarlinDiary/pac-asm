import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { POSTER } from "@/components/home/film";
import { PromoVideo } from "@/components/home/PromoVideo";
import { ASM, PA } from "@/components/home/wordmark";
import styles from "./home.module.css";

const title = "PacAsm";
const description = "Learn MIPS and ARM assembly by writing the moves for Pac-Man.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, siteName: "PacAsm", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function Home() {
  return (
    <main className={styles.home}>
      {/* The poster is the largest thing on screen; React hoists this into <head>. */}
      <link rel="preload" as="image" href={POSTER} fetchPriority="high" />
      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.logo}>
          <span className={styles.srOnly}>PacAsm</span>
          <svg viewBox={PA.viewBox} aria-hidden="true"><path d={PA.d} /></svg>
          <span className={styles.mark} aria-hidden="true" />
          <svg viewBox={ASM.viewBox} aria-hidden="true"><path d={ASM.d} /></svg>
        </h1>
        <Link href="/level/1" prefetch={false} className={styles.start}>
          Start learning <ArrowRight aria-hidden="true" />
        </Link>
      </section>
      <PromoVideo />
    </main>
  );
}
