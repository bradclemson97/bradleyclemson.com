export const siteConfig = {
  name: "Bradley Clemson",
  title: "Full Stack Developer",
  description: "Portfolio website of Bradley Clemson",
  accentColor: "#1d4ed8",
  social: {
    email: "bradclemson97@gmail.com",
    linkedin: "https://www.linkedin.com/in/bradleyclemson/",
    twitter: "https://x.com/bradclemson",
    github: "https://github.com/bradclemson97",
  },
  aboutMe:
    "I’m a full-stack developer at Accenture with a masters degree in Computer Science and certifications in AWS and Azure. I build scalable, intelligent systems and, outside work, a part-time investor with a tech-focused, long-term growth strategy. I research AI and quantum computing to stay on the cutting edge while closely following geopolitics to ground technological insight in global context. My work sits at the intersection of engineering excellence, emerging tech, and strategic perspective.",
  skills: ["Java", "Python", "SQL/PLSQL", "TypeScript", "React", "AWS", "Azure", "Docker"],
  projects: [
    {
      name: "Employee Smart Assistant",
      description:
        "Building a MCP (Model Context Protocol) server exposing data from a PostgreSQL database, then connecting it to a smart assistant client.",
      link: "https://medium.com/@bradclemson/from-sql-to-smart-assistant-connecting-databases-to-ai-with-mcp-fbf79f752189",
      skills: ["AI", "MCP", "Python"],
    },
    {
      name: "System User Management",
      description:
        "A comprehensive User Management and RBAC (Role-based Access Control) solution. Fully scalable and secure with Keycloak IAM.",
      link: "https://github.com/bradclemson97/user-management-service",
      skills: ["IAM", "RBAC", "Keycloak"],
    },
    {
      name: "Spring AI",
      description:
        "Exploring the practical application of generative AI in a Spring Boot application with Spring AI.",
      link: "https://github.com/bradclemson97/spring-ai-example",
      skills: ["Java", "Spring", "AI"],
    },
    {
      name: "Lawn Intelligence",
      description:
        "A mobile-first, fully responsive application that analyzes the health of your lawn and recommends maintenance actions using AI.",
      link: "https://github.com/bradclemson97/lawn-intelligence",
      skills: ["TypeScript", "React", "Python"],
    },
    {
      name: "IoT Aware",
      description:
        "Proposing a conceptual architectural model and mock-up prototype design of a privacy awareness and control interface for IoT systems.",
      link: "https://github.com/bradclemson97/IoTAware",
      skills: ["IoT", "Privacy", "Cyber Security"],
    },
  ],
  experience: [
    {
      company: "Accenture",
      title: "Full Stack Developer",
      dateRange: "Aug 2025 - Present",
    },
    {
      company: "Version 1",
      title: "Java Developer",
      dateRange: "Aug 2022 - Aug 2025",
    },
    {
      company: "Capgemini",
      title: "Software Developer",
      dateRange: "Sept 2020 - Aug 2022",
    },
    {
      company: "Aston University",
      title: "MSc. Computer Science",
      dateRange: "Aug 2019 - Sep 2020",
    },
    {
      company: "Aston University",
      title: "BSc. Business and Management",
      dateRange: "Sept 2015 - Jun 2019",
    },
  ],
  education: [
    {
      school: "Heavily weighted in technology and communications sectors",
      degree: "Long-term Growth Investment Portfolio",
      dateRange: "2024 - present",
      achievements: [
        "A diversified long-term growth portfolio focused on market-leading technology and innovation.",
        "Holdings include Amazon, Microsoft, Alphabet, Meta, NVIDIA, Palantir and ASML.",
        "Represents leadership across cloud computing, artificial intelligence, digital platforms, and semiconductor technology.",
      ],
    },
    {
      school: "Investing in leading innovators",
      degree: "Quantum Computing",
      dateRange: "2025 - present",
      achievements: [
        "A portfolio focused on the rapidly advancing field of quantum computing.",
        "Core holdings include leaders across quantum hardware, cloud-based quantum services, and enabling technologies.",
      ],
    },
  ],
};
