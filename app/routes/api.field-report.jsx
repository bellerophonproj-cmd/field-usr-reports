import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  return Response.json({
    success: true,
    route: "api.field-report loader reached",
    method: request.method,
    url: request.url
  });
}

export async function action({ request }) {
  console.log("FIELD REPORT ACTION HIT");

  try {
    const proxyAuth = await authenticate.public.appProxy(request);

    console.log("APP PROXY AUTH:", proxyAuth);

    return Response.json({
      success: true,
      route: "api.field-report action reached",
      hasAdmin: Boolean(proxyAuth.admin)
    });
  } catch (error) {
    console.error("FIELD REPORT ERROR:", error);

    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}