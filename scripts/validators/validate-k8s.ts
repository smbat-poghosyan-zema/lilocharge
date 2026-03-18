import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

/**
 * Validates Kubernetes manifests for correct syntax and required fields
 */
class K8sManifestValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Validates a Kubernetes manifest file
   * @param filePath - Path to the YAML manifest file
   * @returns True if valid, false otherwise
   */
  validateManifest(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const docs = content.split('---').filter((doc) => doc.trim());

      for (const doc of docs) {
        const manifest = parse(doc);
        if (!manifest) continue;

        this.validateRequiredFields(manifest, filePath);
        this.validateLabels(manifest, filePath);
        this.validateSecurity(manifest, filePath);
        this.validateResources(manifest, filePath);
      }

      return this.errors.length === 0;
    } catch (error) {
      this.errors.push(`Failed to parse ${filePath}: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Validates required fields in manifest
   */
  private validateRequiredFields(manifest: any, filePath: string): void {
    // Skip Kustomization files
    if (manifest.kind === 'Kustomization') {
      return;
    }

    if (!manifest.apiVersion) {
      this.errors.push(`${filePath}: Missing apiVersion`);
    }
    if (!manifest.kind) {
      this.errors.push(`${filePath}: Missing kind`);
    }
    if (!manifest.metadata?.name) {
      this.errors.push(`${filePath}: Missing metadata.name`);
    }
    if (
      !manifest.metadata?.namespace &&
      manifest.kind !== 'Namespace' &&
      manifest.kind !== 'ClusterIssuer'
    ) {
      this.warnings.push(`${filePath}: Missing metadata.namespace`);
    }
  }

  /**
   * Validates labels
   */
  private validateLabels(manifest: any, filePath: string): void {
    const requiredLabels = ['app.kubernetes.io/name', 'app.kubernetes.io/part-of'];

    if (manifest.kind === 'ClusterIssuer' || manifest.kind === 'Kustomization') return;

    const labels = manifest.metadata?.labels || {};
    for (const label of requiredLabels) {
      if (!labels[label]) {
        this.warnings.push(`${filePath}: Missing recommended label ${label}`);
      }
    }
  }

  /**
   * Validates security contexts
   */
  private validateSecurity(manifest: any, filePath: string): void {
    if (!['Deployment', 'StatefulSet', 'Job'].includes(manifest.kind)) return;

    const spec = manifest.spec?.template?.spec;
    if (!spec) return;

    if (!spec.securityContext) {
      this.warnings.push(`${filePath}: Missing pod securityContext`);
    }

    if (spec.securityContext && !spec.securityContext.runAsNonRoot) {
      this.warnings.push(`${filePath}: Should set runAsNonRoot: true`);
    }
  }

  /**
   * Validates resource requests and limits
   */
  private validateResources(manifest: any, filePath: string): void {
    if (!['Deployment', 'StatefulSet'].includes(manifest.kind)) return;

    const containers = manifest.spec?.template?.spec?.containers || [];
    for (const container of containers) {
      if (!container.resources?.requests) {
        this.warnings.push(`${filePath}: Container ${container.name} missing resource requests`);
      }
      if (!container.resources?.limits) {
        this.warnings.push(`${filePath}: Container ${container.name} missing resource limits`);
      }
    }
  }

  /**
   * Gets validation errors
   */
  getErrors(): string[] {
    return this.errors;
  }

  /**
   * Gets validation warnings
   */
  getWarnings(): string[] {
    return this.warnings;
  }

  /**
   * Resets validator state
   */
  reset(): void {
    this.errors = [];
    this.warnings = [];
  }
}

/**
 * Validates all Kubernetes manifests in a directory
 * @param dirPath - Directory path to scan
 */
function validateDirectory(dirPath: string): void {
  const validator = new K8sManifestValidator();
  let totalFiles = 0;
  let validFiles = 0;

  function scanDir(dir: string): void {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDir(filePath);
      } else if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        totalFiles++;
        if (validator.validateManifest(filePath)) {
          validFiles++;
        }
      }
    }
  }

  scanDir(dirPath);

  console.log('\n=== Kubernetes Manifest Validation ===\n');
  console.log(`Total files scanned: ${totalFiles}`);
  console.log(`Valid files: ${validFiles}`);
  console.log(`Files with errors: ${totalFiles - validFiles}\n`);

  const errors = validator.getErrors();
  if (errors.length > 0) {
    console.log('ERRORS:');
    errors.forEach((err) => console.error(`  ❌ ${err}`));
    console.log('');
  }

  const warnings = validator.getWarnings();
  if (warnings.length > 0) {
    console.log('WARNINGS:');
    warnings.forEach((warn) => console.warn(`  ⚠️  ${warn}`));
    console.log('');
  }

  if (errors.length === 0) {
    console.log('✅ All manifests are valid!\n');
    process.exit(0);
  } else {
    console.error('❌ Validation failed with errors.\n');
    process.exit(1);
  }
}

// Main execution
const k8sDir = path.join(__dirname, '../../infrastructure/k8s');
validateDirectory(k8sDir);
