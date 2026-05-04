const corsHeaders = {
  "Access-Control-Allow-Origin": "https://plato-society.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }) {
  return Response.json(
    {
      success: true,
      route: "direct railway loader reached",
    },
    { headers: corsHeaders }
  );
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const formData = await request.formData();

    return Response.json(
      {
        success: true,
        route: "direct railway action reached",
        received: {
          codename: formData.get("codename"),
          product_id: formData.get("product_id"),
          report_text: formData.get("report_text"),
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}