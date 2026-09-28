import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PromoVideo } from "@/components/home/PromoVideo";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.home}>
      <section className={styles.intro} aria-labelledby="home-title">
        <h1 id="home-title" className={styles.brand}>
          <span className={styles.srOnly}>PacAsm</span>
          <span aria-hidden="true">PA</span>
          <Image src="/video/pacasm-mark.png" alt="" width={80} height={80} preload className={styles.brandIcon} />
          <span aria-hidden="true">ASM</span>
        </h1>
        <p className={styles.tagline}>A little code. A lot of play.</p>
        <Link href="/level/1" prefetch={false} className={styles.start}>
          Start learning <ArrowRight aria-hidden="true" />
        </Link>
      </section>
      <PromoVideo />
    </main>
  );
}
