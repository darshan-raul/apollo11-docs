



# kustomize

Best guide on kustomize, covers all of the usecases:
 - use configmap/secret generator
 - use feature to add namespace,prefix,labels,annotations to all manifests
 - use overlays for different envs
 > Small patches that do one thing are recommended. 
 > The target resource is matched using group, version, kind, and name fields from the patch file.
 >Not all resources or fields support strategicMerge patches. To support modifying arbitrary fields in arbitrary resources, Kustomize offers applying JSON patch through Json6902. 
 - In addition to patches, Kustomize also offers customizing container images or injecting field values from other objects into containers without creating patches
 - it is not recommended to hard code the Service name in the command argument. For this usage, Kustomize can inject the Service name into containers through replacements
    https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
https://kubectl.docs.kubernetes.io/references/kustomize/kustomization/




Certainly! Below is a comprehensive bullet-point list of all the topics you need to know to use Kustomize effectively, based on the search results and core Kustomize concepts.

# 🔧 Comprehensive Topics for Mastering Kustomize

## 📚 1. **Core Concepts and Fundamentals**
- **Declarative Configuration Management**: Understanding Kustomize's template-free approach to customizing Kubernetes YAML manifests without forking or modifying original files 
- **Bases and Overlays**: Grasping the base (contains common resources and a `kustomization.yaml` file) and overlay (environment-specific modifications) directory structure for managing multiple configurations 
- **Kustomization File**: Learning the role and syntax of the `kustomization.yaml` file, which serves as the entry point for defining resources, patches, transformers, and generators 
- **GitOps-Friendly Workflow**: Adopting Kustomize's fork/modify/rebase workflow for managing configuration changes in a Git-centric manner 

## 🏗️ 2. **Kustomize Directory Structure**
- **Base Directory**: Organizing common Kubernetes resources (e.g., Deployment, Service) and a base `kustomization.yaml` file that references these resources 
- **Overlay Directories**: Creating environment-specific directories (e.g., `dev`, `prod`) containing patch files and environment-specific `kustomization.yaml` files that inherit from the base 
- **Resource Organization**: Structuring resources to avoid duplication and ensure clean separation of concerns between reusable bases and customizable overlays 

## ⚙️ 3. **Transformers**
- **Common Labels**: Using `commonLabels` to add or override labels across all resources (e.g., `owner`, `app`, `managed-by`) 
- **Common Annotations**: Applying `commonAnnotations` to all resources for metadata management (e.g., `version`, `oncallPager`) 
- **Namespace Transformer**: Setting a default namespace for all resources using the `namespace` field in `kustomization.yaml` 
- **Name Prefix/Suffix**: Modifying resource names uniformly using `namePrefix` and `nameSuffix` (e.g., adding a `-staging` suffix) 
- **Image Transformer**: Updating container image names, tags, and digests across all deployments using the `images` field 
- **FieldSpec Configuration**: Understanding how transformers target specific resource fields using `group`, `version`, `kind`, `path`, and `create` attributes 

## 🔍 4. **Generators**
- **ConfigMapGenerator**: Creating Kubernetes ConfigMaps from literal values, files, or environment variables 
- **SecretGenerator**: Generating Kubernetes Secrets from literals, files, or environment variables (with options for encoding and type) 
- **Generator Options**: Using `generatorOptions` to disable name suffixes, add labels, or modify behavior of generated resources 
- **Hash-Based Resource Names**: Enabling immutable resource names by appending content hashes to generated ConfigMaps/Secrets for cache busting 

## 🧩 5. **Patching Strategies**
- **Strategic Merge Patch**: Using patch files to selectively override fields in base resources (e.g., changing replica counts or resource limits) 
- **JSON Patch**: Applying RFC 6902 JSON patches for more granular and complex modifications (e.g., adding array elements) 
- **PatchesStrategicMerge**: Referencing patch files in the `kustomization.yaml` using the `patchesStrategicMerge` field 
- **PatchesJson6902**: Using JSON 6902 patches for targeted modifications via the `patchesJson6902` field 
- **Patch Targets**: Combining patches with selectors (e.g., `kind`, `name`, `labelSelector`) to apply changes to specific resources 

## 🔧 6. **Kustomization File Fields**
- **Resources**: Listing base resources or other kustomizations to include using the `resources` field 
- **Components**: Reusing sets of transformers, generators, and patches across multiple kustomizations using the `components` field 
- **CRDs**: Including Custom Resource Definitions (CRDs) required for base resources using the `crds` field 
- **Bases**: Referencing other kustomizations or directories (legacy field, replaced by `resources`) 
- **BuildMetadata**: Controlling output behavior (e.g., disabling name hashes, modifying origin annotations) 

## 🚀 7. **Build and Deployment Commands**
- **kustomize build**: Rendering the final Kubernetes manifests from a kustomization directory (e.g., `kustomize build overlays/dev`) 
- **kubectl apply -k**: Applying kustomized resources directly to a cluster (e.g., `kubectl apply -k overlays/prod`) 
- **Debugging Commands**: Using `kustomize build` with `--output` or dry-run options to validate changes before applying 
- **Integration with CI/CD**: Incorporating Kustomize build commands into pipelines for automated deployments 

## 🌐 8. **Integration and Ecosystem**
- **kubectl Integration**: Leveraging Kustomize's native integration with kubectl (available since Kubernetes 1.14) via the `-k` flag 
- **ArgoCD Integration**: Using Kustomize for GitOps-based continuous delivery with ArgoCD 
- **Flux Integration**: Managing Kubernetes manifests with Kustomize in Flux CD workflows 
- **Helm Chart Customization**: Using Kustomize to patch or modify Helm charts without forking the original charts 

## 🔄 9. **Advanced Features**
- **KRM Functions**: Extending Kustomize with custom transformers and generators using Kubernetes Resource Model (KRM) functions 
- **Plugin System**: Writing and using external plugins (e.g., Exec-based plugins) for complex transformations 
- **Function Composition**: Combining multiple KRM functions in a pipeline for advanced processing (e.g., injection + validation) 
- **Multi-Base Composition**: Composing multiple bases and overlays for complex applications (e.g., microservices with shared dependencies) 
- **Remote Resources**: Referencing remote resources (e.g., from GitHub) in kustomizations for distributed management 

## 🛠️ 10. **Best Practices and Patterns**
- **DRY Principle**: Avoiding duplication by reusing common resources and components across environments 
- **Immutability**: Using hash-based names for generated resources to force updates when content changes 
- **Layered Overlays**: Organizing overlays in layers (e.g., `base`, `overlay`, `environment`) for incremental customization 
- **Validation**: Using tools like `kubeval` or KRM functions to validate generated manifests before applying 
- **Secret Management**: Handling secrets securely with Kustomize (e.g., using SOPS or external secret generators) 

## 📊 11. **Troubleshooting and Debugging**
- **Rendered Manifests**: Inspecting the output of `kustomize build` to verify transformations and patches 
- **Dry-Run Mode**: Using `kubectl apply --dry-run=client` with `-k` to preview changes without affecting the cluster 
- **Verbose Logging**: Enabling debug flags in Kustomize or kubectl to trace transformation issues 
- **Common Pitfalls**: Avoiding issues like missing namespace declarations, incorrect patch paths, or generator conflicts 

## 🏢 12. **Real-World Use Cases**
- **Multi-Environment Deployments**: Managing distinct configurations for development, staging, and production environments 
- **Application Reuse**: Customizing third-party applications or Helm charts for specific organizational needs 
- **Gradual Migrations**: Incrementally adopting Kustomize in existing Kubernetes workflows (e.g., from raw manifests to kustomized bases) 
- **Policy Enforcement**: Using transformers to ensure consistent labels, annotations, or resource limits across deployments 

## 💡 13. **Learning and Community Resources**
- **Official Documentation**: Referencing the [Kustomize website](https://kustomize.io) and [Kubernetes docs](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization) for in-depth guides 
- **Glossary**: Understanding key terms (e.g., base, overlay, transformer, generator) from the official Kustomize glossary 
- **Community Engagement**: Joining the [K8s Slack #kustomize channel](https://kubernetes.slack.com/messages/kustomize) or [GitHub discussions](https://github.com/kubernetes-sigs/kustomize) for support 
- **Tutorials and Examples**: Exploring practical examples (e.g., guestbook, WordPress) from the official Kustomize examples repository 

## 📋 Summary Table of Key Kustomize Components

| Component | Purpose | Example |
| :--- | :--- | :--- |
| **Transformers** | Modify resources uniformly | `commonLabels`, `namespace`, `images` |
| **Generators** | Create resources dynamically | `ConfigMapGenerator`, `SecretGenerator` |
| **Patches** | Apply targeted changes | `patchesStrategicMerge`, `patchesJson6902` |
| **Kustomization.yaml** | Orchestrate all customizations | Define `resources`, `patches`, `transformers` |
| **Base/Overlay Structure** | Organize configurations | Base + environment-specific overlays |

---

By mastering these topics, you will be well-equipped to use Kustomize effectively for managing Kubernetes configurations across diverse environments and workflows. Start with the core concepts and gradually explore advanced features based on your use case! 🚀