/**
 * CFT Mailchimp Subscribe Proxy
 * Receives { email, firstName, stage } from the quiz frontend,
 * adds the subscriber to Mailchimp, and applies the correct stage tag.
 */

const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER = 'us7';
const MAILCHIMP_LIST_ID = '0fd50b8910';

// Tag IDs for each stage (created in Mailchimp)
const STAGE_TAGS = {
  1: { id: 8982880, name: 'Salary Quiz - Stage 1' },
  2: { id: 8982882, name: 'Salary Quiz - Stage 2' },
  3: { id: 8982883, name: 'Salary Quiz - Stage 3' },
  4: { id: 8982884, name: 'Salary Quiz - Stage 4' },
};

export default async function handler(req, res) {
  // CORS headers — allow requests from creditsforteachers.com and localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, firstName, stage } = req.body;

  if (!email || !firstName || !stage) {
    return res.status(400).json({ error: 'Missing required fields: email, firstName, stage' });
  }

  const stageNum = parseInt(stage, 10);
  const tagInfo = STAGE_TAGS[stageNum];

  if (!tagInfo) {
    return res.status(400).json({ error: `Invalid stage: ${stage}` });
  }

  const baseUrl = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0`;
  const authHeader = 'Basic ' + Buffer.from(`anystring:${MAILCHIMP_API_KEY}`).toString('base64');

  // Step 1: Add/update subscriber (upsert via PUT to member hash)
  const crypto = await import('crypto');
  const emailHash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');

  const memberPayload = {
    email_address: email,
    status_if_new: 'subscribed',
    status: 'subscribed',
    merge_fields: {
      FNAME: firstName,
    },
  };

  const memberRes = await fetch(`${baseUrl}/lists/${MAILCHIMP_LIST_ID}/members/${emailHash}`, {
    method: 'PUT',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(memberPayload),
  });

  const memberData = await memberRes.json();

  if (!memberRes.ok && memberData.status !== 'subscribed') {
    console.error('Mailchimp member upsert error:', memberData);
    return res.status(500).json({ error: 'Failed to add subscriber', detail: memberData.detail });
  }

  // Step 2: Apply the stage tag
  const tagPayload = {
    tags: [{ name: tagInfo.name, status: 'active' }],
  };

  const tagRes = await fetch(`${baseUrl}/lists/${MAILCHIMP_LIST_ID}/members/${emailHash}/tags`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tagPayload),
  });

  if (!tagRes.ok) {
    const tagData = await tagRes.json();
    console.error('Mailchimp tag error:', tagData);
    return res.status(500).json({ error: 'Subscriber added but tagging failed', detail: tagData.detail });
  }

  return res.status(200).json({
    success: true,
    message: `Subscriber added and tagged with ${tagInfo.name}`,
  });
}
