import LetterGlitch from "@/components/LetterGlitch";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#FFFFFF] dark:bg-[#0F0F0F]">
      <div className="absolute inset-0 opacity-[7%]">
        <LetterGlitch
          glitchColors={['#FABA03', '#9179FF', '#FD4141']}
          glitchSpeed={100}
          smooth={true}
          centerVignette={false}
          outerVignette={false}
        />
      </div>
    </div>
  );
}
