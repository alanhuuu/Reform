import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MacBookHero from '@/components/landing/MacBookHero'
import HowItWorks from '@/components/landing/HowItWorks'
import FeatureHighlights from '@/components/landing/FeatureHighlights'
import InteractiveBackground from '@/components/landing/InteractiveBackground'

export default function Home() {
  return (
    <main className="app-shell min-h-screen overflow-x-hidden">
      <InteractiveBackground />
      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar />
        <MacBookHero />
        <HowItWorks />
        <FeatureHighlights />
        <Footer />
      </div>
    </main>
  )
}
