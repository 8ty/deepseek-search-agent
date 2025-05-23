from setuptools import setup, find_packages

# 读取 requirements.txt 文件
try:
    with open("requirements.txt", "r", encoding="utf-8") as f:
        requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]
except FileNotFoundError:
    requirements = [
        "aiohttp",
        "langchain-text-splitters",
        "jinja2",
        "python-dotenv",
    ]

# 读取 README.md 文件作为长描述
try:
    with open("README.md", "r", encoding="utf-8") as f:
        long_description = f.read()
except FileNotFoundError:
    long_description = "A search agent using DeepSeek R1 reasoning capabilities"

setup(
    name="deepseek-search-agent",
    version="0.1.0",
    description="A search agent using DeepSeek R1 reasoning capabilities",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="DeepSeek Search Agent Developer",
    author_email="admin@example.com",
    url="https://github.com/your-username/deepseek-search-agent",
    packages=find_packages(include=["src", "src.*"]),
    package_dir={"": "."},
    py_modules=["deepseek_r1_search_agent"],
    python_requires=">=3.9",
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest",
            "black",
            "flake8",
            "mypy",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Internet :: WWW/HTTP :: Indexing/Search",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    keywords="deepseek search agent reasoning ai",
    entry_points={
        "console_scripts": [
            "deepseek-search-agent=deepseek_r1_search_agent:main",
        ],
    },
)