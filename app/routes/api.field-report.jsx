const corsHeaders = {
  "Access-Control-Allow-Origin": "https://plato-society.com",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function normalizeProductId(productId) {
  if (!productId) return null;

  if (productId.startsWith("gid://shopify/Product/")) {
    return productId;
  }

  return `gid://shopify/Product/${productId}`;
}

async function getShopifyAccessToken() {
  const shop = process.env.SHOP;
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;

  if (!shop || !clientId || !clientSecret) {
    throw new Error("Missing SHOP, SHOPIFY_API_KEY, or SHOPIFY_API_SECRET.");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to retrieve Shopify access token: " + JSON.stringify(data));
  }

  return data.access_token;
}

export async function loader() {
  return Response.json(
    {
      success: true,
      route: "field report endpoint active",
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

    const codename = formData.get("codename") || "UNKNOWN OPERATOR";
    const productId = normalizeProductId(formData.get("product_id"));
    const reportText = formData.get("report_text");

    if (!productId || !reportText) {
      return Response.json(
        {
          success: false,
          error: "Missing product ID or report text.",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const shop = process.env.SHOP;
    const accessToken = await getShopifyAccessToken();

    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `
          mutation CreateFieldUseReport($metaobject: MetaobjectCreateInput!) {
            metaobjectCreate(metaobject: $metaobject) {
              metaobject {
                id
                handle
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          metaobject: {
            type: "field_use_reports",
            fields: [
              { key: "codename", value: codename },
              { key: "report_text", value: reportText },
              { key: "status", value: "pending" },
              { key: "related_product", value: productId },
            ],
          },
        },
      }),
    });

    const raw = await response.text();

let data;
try {
  data = JSON.parse(raw);
} catch {
  throw new Error("Shopify returned HTML/non-JSON: " + raw.slice(0, 300));
}
    const result = data?.data?.metaobjectCreate;

    if (!response.ok || data.errors || result?.userErrors?.length) {
      return Response.json(
        {
          success: false,
          error: "Shopify rejected the field report.",
          shopify: data,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        message: "FIELD REPORT RECEIVED",
        metaobject: result.metaobject,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || "Transmission failed.",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}