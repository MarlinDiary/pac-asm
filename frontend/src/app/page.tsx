"use client";

import Image from "next/image";
import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LetterGlitch from "@/components/LetterGlitch";

export default function Home() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/level/1");
    }
  }, [router, status]);

  const handleLogin = () => signIn("github");

  return (
    <div className="relative min-h-screen bg-[#FFFFFF] dark:bg-[#0F0F0F]" style={{ fontFamily: 'var(--font-inter)' }}>
      {/* Background Effect */}
      <div className="fixed inset-0 opacity-[5%]">
        <LetterGlitch
          glitchColors={['#FABA03', '#9179FF', '#FD4141']}
          glitchSpeed={60}
          smooth={true}
          centerVignette={false}
          outerVignette={false}
        />
      </div>

      {/* Sticky Navigation Bar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#FFFFFF]/70 dark:bg-[#0F0F0F]/70 border-b border-[#E5E5E5]/50 dark:border-[#3C3C3C]/50">
        <div className="flex justify-between items-center px-8 py-4">
          <div className="flex items-center">
            <Image
              src="/res/logo.png"
              alt="Logo"
              width={24}
              height={24}
              priority
            />
          </div>
          <button
            className="text-black dark:text-white font-medium cursor-pointer"
            onClick={handleLogin}
          >
            Login
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10">

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center px-8 pt-20 pb-20">
          <h1 className="text-5xl md:text-7xl font-bold text-center mb-16 text-gray-900 dark:text-white">
            Learn Assembly,<br/>
            <span className="inline-block pb-2 px-2" style={{ fontFamily: 'var(--font-indie-flower)', lineHeight: '1', fontSize: '1.1em' }}>
              <span className="text-[#F97583] dark:text-[#E85D6F]">P</span>
              <span className="text-[#B392F0] dark:text-[#A17FE0]">l</span>
              <span className="text-[#79B8FF] dark:text-[#5FA4F0]">a</span>
              <span className="text-[#FFAB70] dark:text-[#F09750]">y</span>
              <span className="text-[#9ECBFF] dark:text-[#7AB8E8]">f</span>
              <span className="text-[#F97583] dark:text-[#E85D6F]">u</span>
              <span className="text-[#B392F0] dark:text-[#A17FE0]">l</span>
              <span className="text-[#79B8FF] dark:text-[#5FA4F0]">l</span>
              <span className="text-[#FFAB70] dark:text-[#F09750]">y</span>
            </span>
          </h1>

          {/* GitHub Login Button */}
          <button
            className="flex items-center gap-3 px-6 py-3 bg-gray-950/90 dark:bg-gray-50/90 text-white dark:text-black rounded-md font-medium backdrop-blur-md transition-transform duration-200 ease-out hover:scale-105 shadow-lg cursor-pointer"
            onClick={handleLogin}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            Continue with GitHub
          </button>
        </section>

        {/* Product Showcase */}
        <section className="flex justify-center px-8 pb-20">
          <div className="w-full max-w-7xl">
            <div className="relative aspect-[3/2] rounded-2xl overflow-hidden shadow-2xl border border-[#E5E5E5] dark:border-[#3C3C3C]">
              <Image
                src="/res/demo.png"
                alt="PacAsm Demo"
                fill
                className="object-cover dark:hidden"
                priority
              />
              <Image
                src="/res/demo-dark.png"
                alt="PacAsm Demo Dark"
                fill
                className="object-cover hidden dark:block"
                priority
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
