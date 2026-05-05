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
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to retrieve Shopify access token: " + JSON.stringify(data));
  }

  return data.access_token;
}

async function shopifyGraphQL(query, variables, accessToken) {
  const shop = process.env.SHOP;

  const response = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const raw = await response.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Shopify returned non-JSON: " + raw.slice(0, 300));
  }

  if (!response.ok || data.errors) {
    throw new Error("Shopify GraphQL error: " + JSON.stringify(data));
  }

  return data;
}

async function uploadEvidenceToShopify(file, accessToken) {
  if (!file || !file.size) return null;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Evidence must be JPG, PNG, or WEBP.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Evidence image must be under 10MB.");
  }

  const stagedUploadData = await shopifyGraphQL(
    `
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: [
        {
          filename: file.name,
          mimeType: file.type,
          resource: "FILE",
          httpMethod: "POST",
        },
      ],
    },
    accessToken
  );

  const stagedResult = stagedUploadData.data.stagedUploadsCreate;

  if (stagedResult.userErrors?.length) {
    throw new Error("Staged upload failed: " + JSON.stringify(stagedResult.userErrors));
  }

  const target = stagedResult.stagedTargets[0];

  const uploadForm = new FormData();

  target.parameters.forEach((param) => {
    uploadForm.append(param.name, param.value);
  });

  uploadForm.append("file", file);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    const uploadText = await uploadResponse.text();
    throw new Error("Evidence upload failed: " + uploadText.slice(0, 300));
  }

  const fileCreateData = await shopifyGraphQL(
    `
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
            createdAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      files: [
        {
          originalSource: target.resourceUrl,
          contentType: "IMAGE",
          alt: "Submitted field evidence",
        },
      ],
    },
    accessToken
  );

  const fileCreateResult = fileCreateData.data.fileCreate;

  if (fileCreateResult.userErrors?.length) {
    throw new Error("File create failed: " + JSON.stringify(fileCreateResult.userErrors));
  }

  const createdFile = fileCreateResult.files?.[0];

  if (!createdFile?.id) {
    throw new Error("File create failed: No file ID returned.");
  }

  return createdFile.id;
}

export async function loader() {
  return Response.json(
    { success: true, route: "field report endpoint active" },
    { headers: corsHeaders }
  );
}

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const formData = await request.formData();

    const codename = formData.get("codename") || "UNKNOWN OPERATOR";
    const productId = normalizeProductId(formData.get("product_id"));
    const reportText = formData.get("report_text");
    const classification = formData.get("classification") || "FIELD TESTED";
    const evidenceFile = formData.get("field_evidence");

    if (!productId || !reportText) {
      return Response.json(
        { success: false, error: "Missing product ID or report text." },
        { status: 400, headers: corsHeaders }
      );
    }

    const accessToken = await getShopifyAccessToken();
    const evidenceFileId = await uploadEvidenceToShopify(evidenceFile, accessToken);

const reportDate = new Date().toISOString();

const fields = [
  { key: "codename", value: codename },
  { key: "report_text", value: reportText },
  { key: "status", value: "pending" },
  { key: "related_product", value: productId },
  { key: "report_date", value: reportDate },
  { key: "classification", value: classification },
];
    if (evidenceFileId) {
      fields.push({ key: "field_evidence", value: evidenceFileId });
    }

    const metaobjectData = await shopifyGraphQL(
      `
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
      {
        metaobject: {
          type: "field_use_reports",
          fields,
        },
      },
      accessToken
    );

    const result = metaobjectData.data.metaobjectCreate;

    if (result.userErrors?.length) {
      return Response.json(
        {
          success: false,
          error: "Shopify rejected the field report.",
          shopify: metaobjectData,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        message: "FIELD REPORT RECEIVED",
        metaobject: result.metaobject,
        evidenceFileId,
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