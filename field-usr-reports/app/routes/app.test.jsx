import { useState } from "react";

export default function Test() {
  const [response, setResponse] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);

    const res = await fetch("/api/field-report", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setResponse(data);
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Field Report Test</h1>

      <form onSubmit={handleSubmit}>
        <input name="codename" placeholder="Codename" /><br /><br />
        <input name="product_id" placeholder="Product ID" required /><br /><br />
        <textarea name="report_text" placeholder="Report" required /><br /><br />

        <button type="submit">Transmit</button>
      </form>

      {response && (
        <pre>{JSON.stringify(response, null, 2)}</pre>
      )}
    </div>
  );
}
