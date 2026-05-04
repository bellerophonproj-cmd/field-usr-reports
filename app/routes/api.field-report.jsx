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
    const token = process.env.ADMIN_API_TOKEN;

    if (!shop || !token) {
      return Response.json(
        {
          success: false,
          error: "Missing SHOP or ADMIN_API_TOKEN environment variable.",
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
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
            type: "field_use_report",
            fields: [
              { key: "codename", value: codename },
              { key: "report_text", value: reportText },
              { key: "status", value: "pending" },
              { key: "related_product", value: productId }
            ]
          }
        }
      }),
    });

    const data = await response.json();
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