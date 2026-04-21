"use client";

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import styles from './Team.module.css';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function TeamPage() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [maxSeats, setMaxSeats] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  // Add User Form State
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUsers(data.users);
      setMaxSeats(data.maxSeats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setError('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error);
      
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      fetchUsers(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleExpandTeam = async () => {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMaxSeats(data.maxSeats);
      alert('Your organization team size has been expanded!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading) return <div>Loading team...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className="gradient-text">Team Management</h1>
          <p>Manage users and access for your organization</p>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <button onClick={handleExpandTeam} className="btn btn-secondary">
            Expand Team Seats
          </button>
        )}
      </div>

      <div className={styles.usagePanel + " glass-panel"}>
        <div className={styles.usageInfo}>
          <h3>Seat Usage</h3>
          <p>{users.length} of {maxSeats} seats used</p>
          <div className={styles.usageBar}>
            <div 
              className={styles.usageProgress} 
              style={{ width: `${(users.length / maxSeats) * 100}%` }}
            ></div>
          </div>
        </div>
        <div className={styles.usageMeta}>
          <span className="badge">Active Organization</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px' }}>
        <div className="glass-panel" style={{ padding: '0' }}>
          <table className={styles.userTable}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div>{u.name || 'Anonymous User'}</div>
                    <div className={styles.userEmail}>{u.email}</div>
                  </td>
                  <td>
                    <span className={`${styles.roleBadge} ${u.role === 'ADMIN' ? styles.roleAdmin : ''}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className={styles.userEmail}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    {u.id !== currentUser?.id && currentUser?.role === 'ADMIN' && (
                      <button 
                        onClick={() => handleDeleteUser(u.id)}
                        className={styles.deleteBtn}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {currentUser?.role === 'ADMIN' && (
          <div className={styles.addUserCard + " glass-panel"}>
            <h3 style={{ marginBottom: '24px' }}>Add Team Member</h3>
            {error && <div className="error-text" style={{ marginBottom: '16px', fontSize: '14px' }}>{error}</div>}
            <form onSubmit={handleAddUser}>
              <div className={styles.formGroup}>
                <label>Full Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={(e) => setNewName(e.target.value)} 
                  placeholder="Employee Name"
                  required 
                />
              </div>
              <div className={styles.formGroup}>
                <label>Email Address</label>
                <input 
                  type="email" 
                  value={newEmail} 
                  onChange={(e) => setNewEmail(e.target.value)} 
                  placeholder="email@company.com"
                  required 
                />
              </div>
              <div className={styles.formGroup}>
                <label>Default Password</label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '16px' }}
                disabled={isAdding || users.length >= maxSeats}
              >
                {isAdding ? 'Adding...' : 'Add Member'}
              </button>
              {users.length >= maxSeats && (
                <p style={{ fontSize: '12px', color: '#f87171', marginTop: '8px', textAlign: 'center' }}>
                  No seats available. Please expand your team.
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
