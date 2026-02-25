import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ExternalLink, Github, BookOpen, Globe } from "lucide-react"

const vcfLinks = [
  {
    label: "zpod-vcf-deployer",
    url: "https://github.com/zPodFactory/zpod-vcf-deployer",
    icon: Github,
    description: "Automated VCF deployment scripts for zPods",
  },
  {
    label: "doc-vcf-offlinedepot",
    url: "https://github.com/tsugliani/doc-vcf-offlinedepot",
    icon: Github,
    description: "Documentation for building VCF offline depot bundles",
  },
]

const links = [
  {
    label: "Official Website",
    url: "https://zpodfactory.github.io/",
    icon: Globe,
    description: "Documentation, guides, and project overview",
  },
  {
    label: "GitHub — zpodcore",
    url: "https://github.com/zPodFactory/zpodcore",
    icon: Github,
    description: "Core engine, API server, and CLI tool",
  },
  {
    label: "GitHub — zpodweb",
    url: "https://github.com/zPodFactory/zpodweb",
    icon: Github,
    description: "This web application",
  },
  {
    label: "User Guide",
    url: "https://zpodfactory.github.io/guide/user/",
    icon: BookOpen,
    description: "Getting started with the CLI and managing zPods",
  },
  {
    label: "Admin Guide",
    url: "https://zpodfactory.github.io/guide/admin/",
    icon: BookOpen,
    description: "Setting up endpoints, libraries, and profiles",
  },
]

export function AboutPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">About</h1>

      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-8">
          <img
            src="/zpodfactory-logo.png"
            alt="zPodFactory"
            className="h-32 w-32"
          />
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-primary">zPodFactory</h2>
            <Badge variant="outline">
              zpodweb v0.1.0
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-xl leading-relaxed">
            zPodFactory is a framework for deploying and managing nested
            virtualized lab environments (zPods) on VMware vSphere and Proxmox
            infrastructure. It automates the provisioning of complete software-defined
            datacenters — including ESXi hosts, vCenter, NSX, VCF, and other
            components — into isolated, reproducible environments for testing,
            demos, and development.
          </p>
          <p className="text-sm text-muted-foreground text-center max-w-xl leading-relaxed">
            The platform consists of a core engine with a REST API, a CLI tool
            (zcli), and this web interface (zpodweb) for managing zPod lifecycles,
            component libraries, deployment profiles, and endpoints.
          </p>
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Links &amp; Resources
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 border p-4 transition-colors hover:bg-accent hover:border-primary/30"
            >
              <link.icon className="h-5 w-5 mt-0.5 text-[#94e2d5] shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium group-hover:text-[#94e2d5] transition-colors">
                  {link.label}
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {link.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          VMware Cloud Foundation Related Projects
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {vcfLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 border p-4 transition-colors hover:bg-accent hover:border-primary/30"
            >
              <link.icon className="h-5 w-5 mt-0.5 text-[#94e2d5] shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium group-hover:text-[#94e2d5] transition-colors">
                  {link.label}
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {link.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
