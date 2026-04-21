"use client";

import styles from './page.module.css';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, isLoading } = useAuth();

  return (
    <div className={styles.container}>
      <div className={styles.glowBg}></div>
      
      <header className={styles.header + " glass-panel"}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}></div>
          <span>AppraisalPro</span>
        </div>
        
        <nav className={styles.nav}>
          <Link href="#features" className={styles.navLink}>Features</Link>
          <Link href="#pricing" className={styles.navLink}>Pricing</Link>
          <Link href="#enterprise" className={styles.navLink}>Enterprise</Link>
        </nav>

        <div className={styles.authButtons}>
          {!isLoading && user ? (
            <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className={styles.btnText}>Sign In</Link>
              <Link href="/register" className="btn btn-primary">Get Started</Link>
            </>
          )}
        </div>
      </header>

      <main className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badgeLine}>
            <span className="badge" style={{background: 'rgba(16, 185, 129, 0.1)', color: '#10b981'}}>v2.0 Beta Now Live</span>
          </div>
          <h1 className={styles.title + " gradient-text"}>
            The Future of Property <br /> Inspections is Here.
          </h1>
          <p className={styles.description}>
            Empowering modern appraisers with a unified platform for sketching, 
            data collection, and instant cloud synchronization. Built for speed, 
            engineered for accuracy.
          </p>
          <div className={styles.ctaGroup}>
            <Link href="/register" className={styles.btnHeroPrimary}>Start Your Free Trial</Link>
            <Link href="#demo" className={styles.btnHeroSecondary}>Watch the Sync Demo</Link>
          </div>
          
          <div className={styles.devicePreview}>
            <div className={styles.placeholderDesktop + " glass-panel"}>
               <div className={styles.browserHeader}>
                 <span></span><span></span><span></span>
               </div>
               <div className={styles.browserContent}>
                 <p style={{color: 'var(--text-dim)', fontSize: '12px'}}>Web Dashboard Preview</p>
               </div>
            </div>
          </div>
        </div>
      </main>

      <section id="features" className={styles.features}>
        <div className={styles.featureCard + " glass-panel"}>
          <div className={styles.featureIcon}>📱</div>
          <h3 className={styles.featureTitle}>Offline-First Mobile</h3>
          <p className={styles.featureText}>Full native performance for iOS and Android. Inspect anywhere, even without cellular service.</p>
        </div>
        <div className={styles.featureCard + " glass-panel"}>
          <div className={styles.featureIcon}>☁️</div>
          <h3 className={styles.featureTitle}>Enterprise Cloud Sync</h3>
          <p className={styles.featureText}>Secure, automatic synchronization fueled by DigitalOcean and Postgres. Your data is always safe.</p>
        </div>
        <div className={styles.featureCard + " glass-panel"}>
          <div className={styles.featureIcon}>🏙️</div>
          <h3 className={styles.featureTitle}>Desktop Insights</h3>
          <p className={styles.featureText}>Powerful web dashboard to review, edit, and export your field observations in high resolution.</p>
        </div>
      </section>
    </div>
  );
}
