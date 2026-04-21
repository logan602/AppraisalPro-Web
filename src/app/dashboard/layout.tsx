"use client";

import React, { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './Dashboard.module.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: '#0b0f1a',
        color: '#f1f5f9' 
      }}>
        Loading Dashboard...
      </div>
    );
  }

  if (!user) return null;

  const navItems = [
    { name: 'Appraisals', path: '/dashboard', icon: '📋' },
    { name: 'Analytics', path: '/dashboard/analytics', icon: '📈' },
    { name: 'Organization', path: '/dashboard/settings', icon: '🏢' },
    { name: 'Support', path: '/dashboard/support', icon: '🎧' },
  ];

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}></div>
          <span>AppraisalPro</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${pathname === item.path ? styles.navItemActive : ''}`}
            >
              <span>{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>

        <div className={styles.userCard}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userOrg}>{user.organizationName}</span>
          </div>
          <button onClick={logout} className={styles.logoutBtn} title="Sign Out">
            🚪
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <input 
            type="text" 
            placeholder="Search appraisals..." 
            className={styles.searchBar}
          />
          <div className={styles.headerActions}>
             {/* Future: Notifications, Profile, etc. */}
          </div>
        </header>

        <section className={styles.content}>
          {children}
        </section>
      </main>
    </div>
  );
}
