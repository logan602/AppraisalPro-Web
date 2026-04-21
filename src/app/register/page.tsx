"use client";

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from '../login/Auth.module.css';
import Link from 'next/link';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [planType, setPlanType] = useState<'INDIVIDUAL' | 'ENTERPRISE'>('INDIVIDUAL');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email, 
          password, 
          organizationName: orgName,
          planType
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Auto-login after registration
      login(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.glow}></div>
      <div className={styles.card + " glass-panel"}>
        <div className={styles.header}>
          <h1 className="gradient-text">Get Started</h1>
          <p>Create your organization and start inspecting</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.planGrid}>
          <div 
            className={`${styles.planCard} ${planType === 'INDIVIDUAL' ? styles.active : ''}`}
            onClick={() => setPlanType('INDIVIDUAL')}
          >
            <div className={styles.planIcon}>👤</div>
            <div className={styles.planInfo}>
              <h3>Individual</h3>
              <p>1 user seat included</p>
            </div>
          </div>
          <div 
            className={`${styles.planCard} ${planType === 'ENTERPRISE' ? styles.active : ''}`}
            onClick={() => setPlanType('ENTERPRISE')}
          >
            <div className={styles.planIcon}>🏢</div>
            <div className={styles.planInfo}>
              <h3>Enterprise</h3>
              <p>3 seats included (1 Admin + 2 Base)</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label>Full Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              placeholder="John Doe"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Organization Name</label>
            <input 
              type="text" 
              value={orgName} 
              onChange={(e) => setOrgName(e.target.value)} 
              placeholder="Summit Appraisals LLC"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="name@company.com"
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className={styles.footer}>
          <span>Already have an account?</span>
          <Link href="/login">Sign In</Link>
        </div>
      </div>
    </div>
  );
}
