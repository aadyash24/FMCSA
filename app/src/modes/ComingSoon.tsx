import "./ComingSoon.css";

export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="coming-soon">
      <h3>{title}</h3>
      <p>{blurb}</p>
    </div>
  );
}
