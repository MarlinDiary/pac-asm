"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import LetterGlitch from "@/components/LetterGlitch";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const handleGetStarted = () => router.push("/level/1");

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


      {/* Main Content */}
      <div className="relative z-10">

        {/* Hero Section */}
        <section className="flex flex-col items-center justify-center px-8 pt-20 pb-20">
          <div className="flex items-center mb-8">
            <Image
              src="/res/player.gif"
              alt="Player"
              width={96}
              height={96}
              priority
            />
            <Image
              src="/res/dot.gif"
              alt="Dot"
              width={48}
              height={48}
              priority
            />
            <Image
              src="/res/dot.gif"
              alt="Dot"
              width={48}
              height={48}
              priority
            />
            <Image
              src="/res/dot.gif"
              alt="Dot"
              width={48}
              height={48}
              priority
            />
            <Image
              src="/res/ghost.gif"
              alt="Ghost"
              width={96}
              height={96}
              priority
            />
          </div>
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

          {/* Primary Call to Action */}
          <button
            className="flex items-center gap-2 px-6 py-3 bg-gray-950/90 dark:bg-gray-50/90 text-white dark:text-black rounded-full font-medium backdrop-blur-md transition-transform duration-200 ease-out hover:scale-105 shadow-lg cursor-pointer"
            onClick={handleGetStarted}
          >
            Get started
            <ArrowRight className="w-4 h-4" />
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
