import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PromoVideo } from "@/components/home/PromoVideo";
import styles from "./home.module.css";

export default function Home() {
  return (
    <div className={styles.home}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="PacAsm home">
            <span aria-hidden="true">PA</span>
            <Image src="/video/pacasm-mark.png" alt="" width={40} height={40} className={styles.brandIcon} />
            <span aria-hidden="true">ASM</span>
          </Link>
          <p className={styles.architectures}>MIPS + ARM</p>
        </header>
        <main className={styles.hero}>
          <section className={styles.introduction} aria-labelledby="home-title">
            <p className={styles.eyebrow}>Learn by making moves</p>
            <h1 id="home-title" className={styles.title}>
              <span>A little code.</span>
              <span>A lot of <mark>play.</mark></span>
            </h1>
            <p className={styles.description}>
              Learn MIPS and ARM assembly,<br className={styles.desktopBreak} />
              {" "}one move at a time.
            </p>
            <Link href="/level/1" prefetch={false} className={styles.start}>
              Start learning <ArrowRight aria-hidden="true" />
            </Link>
          </section>
          <PromoVideo />
        </main>
        <footer className={styles.footer}>
          <p>Write code. See it move. Understand why.</p>
          <p>© PACASM</p>
        </footer>
      </div>
    </div>
  );
}
