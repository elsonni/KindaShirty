import { Client, Environment } from 'square';

const accessToken = process.env.SQUARE_ACCESS_TOKEN || 'REPLACE_WITH_YOUR_TOKEN';

const client = new Client({
  accessToken,
  environment: Environment.Production,
});

const parentId = '4TGKGMGIFB5WFCA5I3CFDZ7Y';
const taxId = '54WR3GPFARRMBNAXDOCG4QQZ';

const variations = [
  { id: 'RU5HBYNBGC5YI76B6HRQFQN3', name: 'XS', price: 2500 },
  { id: 'IXRI3WJS6XGP7IQSASXA6KCA', name: 'S',  price: 2500 },
  { id: '4WJEKSK7CDRSMFHV6UEZTPCT', name: 'M',  price: 2500 },
  { id: 'IX5L6VC7ZS3NJJDNURYBVVWS', name: 'L',  price: 2500 },
  { id: 'ZIFH4HBYWZLWPI46NRGJAA3V', name: 'XL', price: 2500 },
  { id: '2S3ZUOKTXQ62YCJNHQQK4GRM', name: '2XL', price: 3000 },
  { id: '53V5JSWYNGTTLZ7W4B6NWQUZ', name: '3XL', price: 3000 },
  { id: 'IM53XVOCJMFYENLXPHWNMLXS', name: '4XL', price: 3000 },
];

async function updateVariation(variation) {
  try {
    const retrieve = await client.catalogApi.retrieveCatalogObject(variation.id);
    const version = retrieve.result.object.version;

    const result = await client.catalogApi.upsertCatalogObject({
      idempotencyKey: `update-tax-${variation.name}-${Date.now()}`,
      object: {
        type: 'ITEM_VARIATION',
        id: variation.id,
        version: version,
        itemVariationData: {
          itemId: parentId,
          name: variation.name,
          pricingType: 'FIXED_PRICING',
          priceMoney: {
            amount: variation.price,
            currency: 'USD'
          },
          taxIds: [taxId]
        }
      }
    });

    console.log(`✅ Updated ${variation.name} (version ${result.result.catalogObject.version})`);
  } catch (err) {
    console.error(`❌ Failed to update ${variation.name}:`, err?.body || err);
  }
}

(async () => {
  for (const v of variations) {
    await updateVariation(v);
  }
})();
