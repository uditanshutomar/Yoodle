import dynamic from "next/dynamic";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import CursorGlow from "@/components/CursorGlow";

const Features = dynamic(() => import("@/components/Features"));
const AIAssistant = dynamic(() => import("@/components/AIAssistant"));
const Pricing = dynamic(() => import("@/components/Pricing"));
const OpenSource = dynamic(() => import("@/components/OpenSource"));
const HowItWorks = dynamic(() => import("@/components/HowItWorks"));
const CTA = dynamic(() => import("@/components/CTA"));
const Footer = dynamic(() => import("@/components/Footer"));

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
