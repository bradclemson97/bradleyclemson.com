export const siteConfig = {
  exploreMoreProjects: "https://github.com/bradclemson97",
  exploreMoreArticles: "https://medium.com/@bradclemson",
  projects: [ /* ... */ ],
  articles: [ /* ... */ ],

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
    "I’m a full-stack developer specialising in the design and development of intelligent, scalable systems. Experienced in government and defense, I operate in high-stakes environments where reliability, security, and innovation are critical. My work sits at the intersection of engineering excellence, emerging technologies, and strategic insight - combining deep technical capability with a clear understanding of the forces shaping the future.",
  skills: ["Java", ".NET", "C#", "Python", "SQL/PLSQL", "TypeScript", "React", "Docker", "AWS", "Azure", "Palantir"],
  projects: [
     {
      name: "Global Monitor",
      description:
        "Near real-time monitoring of global events, geopolitical tensions, and emerging risks.",
      link: "https://bradleyclemson.com/situation-room",
      skills: ["TypeScript", "React", "Geopolitics"],
    },
    {
      name: "Employee Smart Assistant",
      description:
        "Building a MCP (Model Context Protocol) server exposing data from a PostgreSQL database, connecting it to a smart assistant client.",
      link: "https://medium.com/@bradclemson/from-sql-to-smart-assistant-connecting-databases-to-ai-with-mcp-fbf79f752189",
      skills: ["Claude", "MCP", "Python"],
    },
    {
      name: "System User Management",
      description:
        "A comprehensive User Management and RBAC (Role-based Access Control) solution. Fully scalable and secure with Keycloak IAM.",
      link: "https://github.com/bradclemson97/user-management-service",
      skills: ["IAM", "RBAC", "Keycloak"],
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
      client: "Ministry of Defence",
      dateRange: "Aug 2025 - Present",
    },
    {
      company: "Version 1",
      title: "Java Developer",
      client: "Home Office",
      dateRange: "Aug 2022 - Aug 2025",
    },
    {
      company: "Capgemini",
      title: "Software Developer",
      client: "HMRC",
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
  articles: [
      {
          title: "The Evolution of AI: Unleashing Prediction and Imagination",
          description: "Personal thoughts on the next wave of AI adoption.",
          link: "https://medium.com/version-1/the-evolution-of-ai-unleashing-prediction-and-imagination-26a3321a07cc",
          date: "Sept 2023"
      },
      {
          title: "Building a Generative AI Application with Spring AI",
          description: "In this tutorial, we will explore the practical application of generative AI in a Spring Boot application with Spring AI.",
          link: "https://medium.com/version-1/building-a-generative-ai-application-with-spring-ai-dce717e38526",
          date: "Jan 2024"
      },
  ],
  finance: [
    {
      school: "Heavily weighted in technology and communications sectors",
      degree: "Long-term Growth Investment Portfolio",
      dateRange: "2024 - present",
      achievements: [
        "A diversified long-term growth portfolio focused on market-leading technology and innovation.",
        "Represents leadership across cloud computing, artificial intelligence, digital platforms, and semiconductor technology.",
      ],
    },
  ],
};
