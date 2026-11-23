import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiClientError, setToken } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; expiresIn: number }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: login.trim(), password }),
      });
      setToken(r.token, r.expiresIn);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container login-wrap">
      <div className="login-card">
        <div className="login-head">
          <h1>Служебный вход</h1>
          <p>Панель администратора кинотеатра «Аврора»</p>
        </div>
        <form className="login-body" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="login">Логин</label>
            <input
              id="login"
              className="input"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Введите логин"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Проверяем…' : 'Войти в панель'}
          </button>
        </form>
      </div>
    </div>
  );
}
