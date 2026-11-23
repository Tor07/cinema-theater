import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container">
      <div className="state-box" style={{ marginTop: 72 }}>
        <h3>Страница не найдена</h3>
        <p>Вернитесь к афише — сеансы уже идут.</p>
        <Link to="/" className="btn btn-primary">
          К афише
        </Link>
      </div>
    </div>
  );
}
