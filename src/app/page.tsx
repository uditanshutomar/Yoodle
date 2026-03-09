import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import AIAssistant from "@/components/AIAssistant";
import Pricing from "@/components/Pricing";
import OpenSource from "@/components/OpenSource";
import HowItWorks from "@/components/HowItWorks";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import CursorGlow from "@/components/CursorGlow";

export default function Home() {
  return (
    <>
      <CursorGlow />
      <Navbar />
      <main>
        <Hero />
        <Features />
        <AIAssistant />
        <Pricing />
        <OpenSource />
        <HowItWorks />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
