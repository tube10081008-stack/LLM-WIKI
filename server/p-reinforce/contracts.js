import fs from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const CONTRACT_ROOT = path.resolve(process.cwd(), 'contracts');

let contractRegistryPromise;

export async function getContractRegistry() {
  if (!contractRegistryPromise) {
    contractRegistryPromise = loadContractRegistry();
  }

  return contractRegistryPromise;
}

export async function validateContract(contractName, payload) {
  const registry = await getContractRegistry();
  const entry = registry.validators.get(contractName);

  if (!entry) {
    throw new Error(`Unknown contract "${contractName}".`);
  }

  const isValid = entry.validate(payload);

  if (!isValid) {
    throw new Error(
      `${contractName} contract validation failed: ${formatAjvErrors(entry.validate.errors)}`,
    );
  }

  return payload;
}

export async function getContractHealth() {
  try {
    const registry = await getContractRegistry();

    return {
      valid: true,
      bundleVersion: registry.manifest.bundle_version,
      contracts: [...registry.validators.keys()],
      errors: [],
    };
  } catch (error) {
    return {
      valid: false,
      bundleVersion: null,
      contracts: [],
      errors: [error instanceof Error ? error.message : 'Unknown contract loading error.'],
    };
  }
}

async function loadContractRegistry() {
  const manifestPath = path.join(CONTRACT_ROOT, 'contract-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });

  addFormats(ajv);

  const validators = new Map();
  const schemaEntries = [
    ...manifest.canonical_artifacts,
    ...manifest.derived_artifacts,
  ];

  for (const entry of schemaEntries) {
    const schemaPath = path.resolve(process.cwd(), entry.schema);
    const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));
    validators.set(entry.name, {
      schemaPath,
      validate: ajv.compile(schema),
    });
  }

  return {
    manifest,
    validators,
  };
}

function formatAjvErrors(errors = []) {
  return errors
    .map((error) => {
      const at = error.instancePath || '/';
      return `${at} ${error.message}`.trim();
    })
    .join('; ');
}
