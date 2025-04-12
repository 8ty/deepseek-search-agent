Title: Using DeepSeek R1 Reasoning Model in DeepSearch

URL Source: https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/

Published Time: 2025-04-01T09:38:45.000+02:00

Markdown Content:
[In our view, DeepSearch is essentially a big while-loop.](https://jina.ai/news/a-practical-guide-to-implementing-deepsearch-deepresearch) Given maximum token budgets, it cycles between searching, reading, and thinking until it finds the best answer. One of the LLM's key tasks is determining which action to take next based on the current memory state. Should it continue searching? Read the webpage? Or answer the question directly?

In our [node-deepresearch](https://github.com/jina-ai/node-DeepResearch) implementation, we use a _standard_ LLM (`gemini-2.0-flash`) for choosing the action. We call it "standard" as the reasoning process is explicitly outlined via prompt engineering, and then operates as sequence-in, sequence-out with the chosen action returned in a JSON object. So a natural question arises: would replacing this decision step with a dedicated reasoning model improve DeepSearch performance?

![Image 1: Diagram comparing Gemini 2.0 Flash algorithm and standard LLM, showing budget, next actions, and flow of reasoning with color](https://jina-ai-gmbh.ghost.io/content/images/2025/04/Heading--91-.png)

The action-decision step of the big while-loop in our DeepSearch implementation determines, based on the current context and memory, what the next action should be.

In this post, we explore using [DeepSeek R1](https://github.com/deepseek-ai/DeepSeek-R1) 671b, a reasoning LLM to replace `gemini-2.0-flash` for this decision step. We believe that R1’s reasoning skills will help it solve the complex problems in searching the web and analyzing the results.

To test this concept, we set it loose on a practical example: planning a comprehensive three-day holiday itinerary, and then evaluate how it performed. Agent performing deep search tasks are likely to encounter the same kind of problems as humans, so in our holiday task the model may encounter some of the following issues:

*   **Knowledge gaps (information dependent on other information)**: For example, you want to visit the Eiffel Tower, but don't know if it's open on public holidays. You need to find out both the tower's holiday schedule and the dates of French public holidays.
*   **Wrong or outdated information**: A travel blog from 2020 suggests a specific restaurant in Rome is open on Sundays, but upon arrival, you find it has changed its hours and is now closed on Sundays.
*   **Contradictory information**: One travel website claims that a particular hotel in New York offers free breakfast, while another site states that breakfast is not included in the room rate.
*   **Ambiguous information**: A travel forum post mentions "a great beach near Barcelona" without specifying which beach or providing clear directions, making it difficult to pinpoint the exact location.

R1 can break down complex tasks into actionable steps, identify gaps and inconsistencies, and navigate hurdles like blocked websites and subscriber walls. It has the reasoning abilities to gather the required knowledge and synthesize an answer. However, it can’t plan a holiday for us alone — that requires searching the web and understanding the results it gets back. We have to soup it up, putting in a framework and enhancing its abilities, before it’s up to the job.

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#implementation "Implementation")Implementation
-----------------------------------------------------------------------------------------------------------------------

[Google Colab ![Image 2](https://jina-ai-gmbh.ghost.io/content/images/icon/favicon-32.ico) ![Image 3](https://jina-ai-gmbh.ghost.io/content/images/thumbnail/colab_favicon_256px-7.png)](https://colab.research.google.com/drive/18sqU8_eWqFleKqpd-SnGDNmZ_P1KLfXw?usp=sharing#scrollTo=2jFWdbnp_6ws)

To run the notebook, you’ll need free [Jina AI](https://jina.ai/) and [OpenRouter](https://openrouter.ai/) API keys.

While R1 is the engine of our agent, we also add some tools, a state object, and, of course, a (rather large) prompt. Here’s a simplified representation:

![Image 4: Technical flowchart of an AGENT SYSTEM illustrating stages like response, tool execution, and status checks.](https://jina-ai-gmbh.ghost.io/content/images/2025/03/image-29.png)

*   **The tools** can be called by the model to search and scrape the web, and results are stored in the state.
*   **The state** keeps track of tool results, task status, and knowledge. It’s stored in the prompt itself.
*   **A single prompt** provides instructions, specifying the task and how to go about it, as well as storing the state.

We’ll go over each of these in more detail later in the post, especially the prompt. But, in short, the system works as follows:

We start with the prompt with an unpopulated state object. While the task is in progress (i.e. trying to produce an answer) the agent runs through the following loop until it produces an answer:

1.  The model examines the task and its state from the prompt, and reasons how best to use its tools to get an answer.
2.  The model outputs a JSON object specifying its status (`IN PROGRESS` or `DONE`), memory updates, tool calls, and the answer (initially `null`).
3.  The agent calls tools asynchronously and results are embedded back into the prompt, as well as the JSON object from step 3.
4.  The prompt (containing this new information) is fed back into the model to run for another loop.

As soon as the model provides an answer in its output, the task ends and the answer is delivered.

💡

To get a better idea for how the agent works in action, we suggest you try [the notebook](https://colab.research.google.com/drive/18sqU8_eWqFleKqpd-SnGDNmZ_P1KLfXw?usp=sharing#scrollTo=2jFWdbnp_6ws) yourself and examine the output at each iteration.

Now that we’ve got a high-level overview, let’s look at the tools, state, and prompt in turn:

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#tools "Tools")Tools
--------------------------------------------------------------------------------------------

Since R1 can't search or scrape the web by itself, we access Jina’s Reader API to expand its capabilities. This includes two modes:

*   **Search mode**: searches the web for relevant terms and return search engine results (including URLs, titles, and descriptions of each result).
*   **Read mode**: scrapes pages from search results and returns them in Markdown format.

Due to R1’s limited context window, we can’t just dump the a whole page into the `Tool Results` section of the prompt. We need extra tooling to select just the most relevant information before passing it to the model:

*   [**LangChain recursive character text splitter**](https://python.langchain.com/docs/concepts/text_splitters/): We break long outputs into segments with `RecursiveCharacterTextSplitter`, recursively splitting on paragraphs and sentences until we get the desired segment size. This ensures output is easily digestible by R1's limited context window.
*   [**Jina Reranker**](https://jina.ai/reranker): We rerank the segments with [jina-reranker-v2-base-multilingual](https://jina.ai/?sui&model=jina-reranker-v2-base-multilingual) and combines the top-ranked segments into one result.

Unfortunately, DeepSeek R1 doesn’t support tool use in the same way as `o3-mini` does. For example, with `o3-mini`, we could use something like the following:



def scrape_page(url: str):
“”“Scrape a web page with Jina Reader”“”

tools = [
{
“type”: “function”,
“function”: {
“name”: “scrape_page”,
“description”: “Scrape the content of a webpage”,
“parameters”: {
“url”: {“type”: “string”, “description”: “The URL to scrape”}
}
}
}
]

client = OpenAI()
response = client.completions.create(
model=“o3-mini”,
prompt=f"Scrape www.skyscanner.net/routes/gr/de/germany-to-crete.html",
tools=tools
)


Example o3-mini code to support tool use

But this isn’t so easy with R1: It doesn’t have a `tools` parameter that we can pass to the API, and it won’t return structured `tool_calls` as part of its response. Simply put, it wasn’t trained to make use of tools ([and it won’t support them any time soon](https://github.com/deepseek-ai/DeepSeek-R1/issues/9)). At least, it doesn’t support them in the traditional sense. However, we _can_ still ask R1 to output tool calls in JSON format, and feed the tool call results back into the model to analyze:



You must respond with a valid JSON object containing:

{
  "tool_calls": [
    {"tool": "search", "input": "Cheapest flights from Germany to Crete May 2025"},
    {"tool": "scrape", "input": "<https://www.skyscanner.net/routes/gr/de/germany-to-crete.html>"}
  ]
}


Tool calls as part of R1's prompt

After the model outputs tool calls in iteration _n_, the tools are called, and results are embedded into the `Tool Results` section of the prompt for the model to reason with on iteration _n+1_:



Tool Results:

Source 1️: search: Cheapest flights from Germany to Crete May 2025
Result:

Title: Affordable flights: Germany - Heraklion (Crete) (HER) | Eurowings URL Source: https://www.eurowings.com/en/booking/offers/flights-from/DE/to/GR/HER.html Description: Affordable flights from Germany to Heraklion (Crete) ✈ Eurowings brings you closer to your dream destination from as little as €89.99*. Book now and enjoy.
Title: Are you a person or a robot? URL Source: https://www.skyscanner.com/routes/fran/her/frankfurt-to-crete-heraklion.html Description: Book a one-way ticket from Frankfurt to Heraklion Airport from $78 or travel return from just $154. The prices shown are based on availability and could change ...


Tool results, showing search results for Germany-Crete flights

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#state "State")State
--------------------------------------------------------------------------------------------

The state keeps track of task status (`Status`) and knowledge (`Memory`) which the model needs to analyze and update. In short, it’s the system’s working memory and memory banks. This is stored in a section of the prompt called `{{ workspace }}` and it starts off as a blank slate:

```
Status: IN_PROGRESS
Memory: 
... no memory blocks ..
```

Empty state object

As the model reasons about the task, runs tools, and gathers output, the state is populated with memory blocks (derived from tool output), each with their own randomly-assigned ID. For our holiday planning example, the state might look like this after we run one iteration of the agent:

```
Status: IN_PROGRESS
Memory: 
<nuz-032>Potential warm May destinations: Malaga (Spain), Crete (Greece), Algarve (Portugal)</nuz-032>
<xwj-969>URL to scrape for Crete hotel details: <https://www.tripadvisor.com/HotelsList-Crete-Beachfront-Cheap-Hotels-zfp13280541.html></xwj-969>
<vsc-583>URL to scrape for flight details: <https://www.expedia.com/lp/flights/fra/her/frankfurt-to-heraklion></vsc-583>
```

State populated by DeepSeek R1

The memory blocks are updated by including a list of `memory_updates` in the model’s JSON response:

```
{
	"memory_updates": [
	  {"operation": "add", "content": "Round-trip flight from Berlin to Tenerife in May 2025 ranges from €59.99 to €200 round-trip as per the Skyscanner and Iberia sources."},
	  {"operation": "delete", "id": "nuz-032"},
	  ...
	]
}
```

Memory updates as part of R1's JSON output

*   The **`add` operation** adds a memory block and can be used to store important information such as leads, findings, information gaps, and actions its already taken.
*   The **`delete` operation** deletes a memory block, allowing the model to delete old, unnecessary, or false information and maintain a clean workspace.

💡

We also tested a `replace` operation, but we found the model generated large blocks of information (overly relying on `replace`), and decided to remove this option.

Compared to issuing tool calls, R1 is less familiar with managing its own memory. While the model was specifically trained to reason through complex math problems and coding tasks—training that enables it to produce accurate JSON objects and execute tool calls—it wasn't trained to manage memory-like states (nor was any other model we know of).

Storing information using a compact memory-like state provides several advantages over storing the entire output from the model each round. This approach condenses information within the prompt, preventing context overflow while enhancing the model's focus on relevant knowledge. We keep as JSON because it’s easy to update but the JSON gets rendered in a human readable format in the prompt itself.

Even so, memory management still falls outside R1’s core domain; we needed to implement multiple instructions to guide the model in properly handling memory operations. Here’s the part of our prompt that deals with that:

```
... other contents of the prompt ...

## Memory Block Usage
- Each memory block has a unique ID in format <abc-123>content</abc-123>
- Create separate blocks for distinct pieces of information:
  * Discovered URLs (both explored and pending)
  * Information gaps that need investigation
  * Actions already taken (to avoid repetition)
  * Promising leads for future exploration
  * Key facts and findings
  * Contradictions or inconsistencies found
- Keep each block focused on a single idea or piece of information
- Always cite sources when recording information from tool results
- Use IDs to track and manage your knowledge (e.g., deleting outdated information)
- Make sure to store sources (URLs) for the facts and findings you store

## Lead Management
- Since you can only make 3 tool calls per round, store promising leads for later
- Create dedicated memory blocks for URLs to scrape later
- Maintain blocks for potential search queries to explore in future rounds
- Prioritize leads based on relevance to the task

... other contents of the prompt ...
```

Memory handling instructions in prompt

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#prompt "Prompt")Prompt
-----------------------------------------------------------------------------------------------

We created the prompt using the [Jinja template format](https://jinja.palletsprojects.com/en/stable/templates/). It consists of several sections:

*   **Context** (in this case, the current date).
*   **Instructions**, covering how everything works, and telling the model which tools are available.
*   **State**, discussed above.
*   **Tool outputs**, from the `search` and `scrape` tools.



{% macro format_tool_results(tool_records) %}
{% for to in tool_records %}
Source {{ loop.index }}️: {{ to.tool }}: {{ to.input }}
Result:

{{ to.output }}


{% endfor %}
{% endmacro %}

The date: {{ current_date }}.
You are an information analysis and exploration agent that builds solutions through systematic investigation.

Investigation Cycle

You operate in a continuous investigation cycle:

Review current workspace (your memory blocks)
Analyze new tool results (or initial task if first round)
Update memory with new insights and track investigation progress
Decide on next tools to call based on identified leads and information gaps
Repeat until task completion
Memory Structure

Your memory persists between investigation cycles and consists of:

Status: Always the first line, indicates if the task is IN_PROGRESS or DONE
Memory: A collection of discrete information blocks, each with a unique ID
Memory Block Usage
Each memory block has a unique ID in format content
Create separate blocks for distinct pieces of information:
Discovered URLs (both explored and pending)
Information gaps that need investigation
Actions already taken (to avoid repetition)
Promising leads for future exploration
Key facts and findings
Contradictions or inconsistencies found
Keep each block focused on a single idea or piece of information
Always cite sources when recording information from tool results
Use IDs to track and manage your knowledge (e.g., deleting outdated information)
Make sure to store sources (URLs) for the facts and findings you store
Lead Management
Since you can only make 3 tool calls per round, store promising leads for later
Create dedicated memory blocks for URLs to scrape later
Maintain blocks for potential search queries to explore in future rounds
Prioritize leads based on relevance to the task
Available Tools
search: Use for broad information gathering on new topics or concepts
Example: {“tool”: “search”, “input”: “renewable energy statistics 2023”}
scrape: Use for extracting specific details from discovered URLs
Example: {“tool”: “scrape”, “input”: “https://example.com/energy-report”}
Tool Usage Guidelines
When to use search: For new concepts, filling knowledge gaps, or exploring new directions
When to use scrape: For URLs discovered that likely contain detailed information
Maximum 3 tool calls per round
Never repeat the exact same tool call
Always record valuable information from tool results in memory blocks
Response Format

You must respond with a valid JSON object containing:

{
  "status_update": "IN_PROGRESS or DONE",
  "memory_updates": [
    {"operation": "add", "content": "New insight or lead to investigate"},
    {"operation": "delete", "id": "abc-123"}
  ],
  "tool_calls": [
    {"tool": "search", "input": "specific search query"},
    {"tool": "scrape", "input": "https://discovered-url.com"}
  ],
  "answer": "Your final, comprehensive answer when status is DONE"
}

Important Rules
The “add” operation creates a new memory block
You do not need to specify an ID, it will be added automatically by the system.
The “delete” operation requires the specific ID of the block to remove
Never invent or fabricate information - only use facts from your memory or tool results
Never make up URLs - only use URLs discovered through tool results
CRITICAL: Any information not recorded in your memory blocks will be lost in the next round
For example, if you find a potential webpage to scrap, you must store the URL and your intention
Example: {"operation": "add", "content": "Found relevant URL: https://... to scrape ..."}
Set status to “DONE” only when you have fully addressed the task
Only include the “answer” field when status is “DONE”

Task:

{{ task }}


Current workspace:

{{ workspace }}


Tool Results:
{{ format_tool_results(tool_records) if tool_records else ‘… no previous tool results …’}}

IMPORTANT: Generate a valid JSON response following the format above.

Think carefully about:

what information do you need to preserve
which tools to call next
how to build your answer systematically with focused memory blocks

Entire prompt used in our deep search system

💡

The Jinja macro function at the top of the prompt just renders tool results in a cleaner format.

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#evaluation "Evaluation")Evaluation
-----------------------------------------------------------------------------------------------------------

We put our system to the test with our holiday planning example. Here’s the task embedded into the prompt:

```
Help me plan a 3 day holiday in Europe in May for under 2000 EUR
1. I need specific flight and hotel recommendations.
2. I want the destination to be warm.
3. I want to have a beach nearby the hotel.
I live in Germany.
```

Here’s the final result (after five iterations of the loop):

```
**3-Day Crete Holiday Plan (Total ≈ €600-800)**

✈️ *Flights (From Frankfurt):*  
- Skyscanner: €154 round trip (May 2025 dates)  
  Source: <https://www.skyscanner.com/routes/fran/her/frankfurt-to-crete-heraklion.html>  
- Backup: Eurowings €180 round trip  

🏨 *Beachfront Hotels:*  
1. **Georgioupolis Beach Hotel**  
   - Direct beach access, bike rentals €10  
   - Source: <https://www.tripadvisor.com/HotelsList-Crete-Beachfront-Cheap-Hotels-zfp13280541.html>  

2. **JT Apartments**  
   - €57/night, 9.5/10 rating, 5-min walk to beach  
   - Source: <https://www.booking.com/region/gr/crete.html>  

3. **FNK Apartments**  
   - Sea views, 9.6/10 rating  

💰 *Budget Breakdown:*  
- Flights: €154  
- Hotel (3 nights): €171-250  
- Remaining: €1,600+ for meals/activities  

*Note:* All hotels are <5 mins from beaches. Crete averages 25°C in May (Source: TravelSupermarket).
```

Result for holiday search task, after five iterations

That answer _looks_ legitimate. But is it really? After all, models are known to hallucinate, and with a system of multiple moving parts, it’s likely something could go wrong. Let’s verify a few details in R1's output:

### [](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#destination-and-total-budget "Destination and Total budget")Destination and Total budget

The calculations for each item all add up (we'll go into whether each item is accurate below). After all, R1 was trained on math problems. The destination also checks out; Crete is a popular location.

### [](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#flights "Flights")Flights

Flight prices _almost_ add up, but let’s see where things went wrong. First of all, here are the actual prices from _Skyscanner_ from Frankfurt to Heraklion, for May 2025, round-trip:

![Image 5: Screenshot of a flight comparison website showing options with details on price, travel time, eco-friendliness, and departure](https://jina-ai-gmbh.ghost.io/content/images/2025/03/image-25.png)

Actual Skyscanner search results for Frankfurt-Heraklion flights for May 2025

We can see the prices are all around the 200 EUR mark, and not the promised 154 EUR for a round-trip! But where does the error come from? Looking at the logs, we find a related memory block was added in round 3:

```
{"operation": "add", "content": "Crete flight options: Eurowings €89.99* one-way ..."}
```

Memory block related to Germany-Crete flights

This block seems to be inferred from the attached search result:



Source 1️: search: Cheapest flights from Germany to Crete May 2025
Result:

... other results ...
Title: Are you a person or a robot?
URL Source: https://www.skyscanner.com/routes/fran/her/frankfurt-to-crete-heraklion.html
Description: Book a one-way ticket from Frankfurt to Heraklion Airport from $78 or travel 
return from just $154. The prices shown are based on availability and could change ...


Search result for Germany-Crete flights

The model never tried to scrape this web page to confirm the results, but it likely wouldn’t have made a difference. However, it should have at least noticed the search results didn’t include “May” as the period.

### [](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#hotel "Hotel")Hotel

The hotels check out, but we identified some improvements that could be made. Firstly, we wish the model had put more effort into finding the prices for Georgioupolis Beach Hotel & FNK Apartments - while it provides other information, prices are sadly lacking. To see what we mean, here’s the raw output of the scraped [URL](https://www.booking.com/region/gr/crete.html) that was used to generate hotel recommendations. It only shows prices for the first and last results, skipping the middle three:



Source 3️: scrape: https://www.booking.com/region/gr/crete.html
Result:

Show more Show less

Moritz Germany

*   ### [JT Apartments](https://www.booking.com/hotel/gr/jt-apatments.html?label=gen173nr-1FCAYoXEIFY3JldGVIM1gEaJUCiAEBmAExuAEZyAEM2AEB6AEB-AECiAIBqAIDuALSvqC-BsACAdICJDc5ZWE5ZDJkLTI2ZWEtNGNiMS04MzNlLTJhNWIyMGI5Y2M3NdgCBeACAQ&sid=f21cdd5fe9eb08dcac7d3a0304f9ccc9)

Kissamos

From $57 per night

9.5 Exceptional 313 reviews

I highly recommend staying at JT Apartments. When we entered the apartment we were greeted with a pleasant surprise. Everything was well equipped. The neighborhood is peaceful, supermarket nearby. The beach is just a short walk away. It's a great location if you want to visit the most beautiful beaches in Crete. Thanks to you our stay was exactly as we had dreamed :)

Show more Show less

Katarzyna Poland
Show more Show less

Aitor Germany

*   ### [FNK Apartments with Sea View](https://www.booking.com/hotel/gr/f-amp-k-apartments.html?label=gen173nr-1FCAYoXEIFY3JldGVIM1gEaJUCiAEBmAExuAEZyAEM2AEB6AEB-AECiAIBqAIDuALSvqC-BsACAdICJDc5ZWE5ZDJkLTI2ZWEtNGNiMS04MzNlLTJhNWIyMGI5Y2M3NdgCBeACAQ&sid=f21cdd5fe9eb08dcac7d3a0304f9ccc9)

Agia Pelagia

9.6 Exceptional 64 reviews

We were in Crete for a week. During this time, we stayed at FnK Apartments. Froso and Konstantinos were super friendly and amazing hosts for us. They were always ready to help if we had questions or needs of any sort. The apartment itself has a beautiful view of Agia Pelagia and the surrounding bays (and even the beautiful sunrise). We can only recommend FnK Apartments!!

Show more Show less

Moritz Germany
Show more Show less

mary United States

*   ### [Artemis Hotel Apartments](https://www.booking.com/hotel/gr/artemis-hersonisos.html?label=gen173nr-1FCAYoXEIFY3JldGVIM1gEaJUCiAEBmAExuAEZyAEM2AEB6AEB-AECiAIBqAIDuALSvqC-BsACAdICJDc5ZWE5ZDJkLTI2ZWEtNGNiMS04MzNlLTJhNWIyMGI5Y2M3NdgCBeACAQ&sid=f21cdd5fe9eb08dcac7d3a0304f9ccc9)

Limenas Hersonissou, Hersonissos

9.0 Wonderful 419 reviews

If you want to feel welcome, to be treated like friends, to know that you will get help in everything, we highly recommend you to stay at the hotel. Thank you from the bottom of our hearts to Konstantine for the warm and very personal treatment! On our next visit to Crete, we will be happy to stay at Artemis Hotel again!

Show more Show less

Irina Israel
Show more Show less

Ann Marie Ireland

*   ### [Pinelopi Hotel](https://www.booking.com/hotel/gr/pinelopi.html?label=gen173nr-1FCAYoXEIFY3JldGVIM1gEaJUCiAEBmAExuAEZyAEM2AEB6AEB-AECiAIBqAIDuALSvqC-BsACAdICJDc5ZWE5ZDJkLTI2ZWEtNGNiMS04MzNlLTJhNWIyMGI5Y2M3NdgCBeACAQ&sid=f21cdd5fe9eb08dcac7d3a0304f9ccc9)

Platanes

7.8 Good 198 reviews

Great location close to the beach, great tavernas and also in a good location for traveling around by car. Quiet area, perfect for a wonderful holiday time. Spacious rooms equipped with all you need. Great value for the money. The pool area was excellent and you can relax there anytime during the day. The parking place near the hotel was perfect. I will for sure return to Pinelopi Hotel, when visiting Crete again.

Show more Show less

Rita Romania
Show more Show less

Katarzyna Poland

*   ### [Elizabeth Suites](https://www.booking.com/hotel/gr/elizabeth-suites.html?label=gen173nr-1FCAYoXEIFY3JldGVIM1gEaJUCiAEBmAExuAEZyAEM2AEB6AEB-AECiAIBqAIDuALSvqC-BsACAdICJDc5ZWE5ZDJkLTI2ZWEtNGNiMS04MzNlLTJhNWIyMGI5Y2M3NdgCBeACAQ&sid=f21cdd5fe9eb08dcac7d3a0304f9ccc9)

Kato Daratso

From $74 per night

9.1 Wonderful 86 reviews

We had a great stay made even more personable by Epas the owner who constantly had a smile and was very helpful and the staff were lovely particularly Anna. We had breakfast a couple of days which were more than plentiful. Apartments were in a perfect position for beaches and restaurants. We highly recommend The Elizabeth Suites made our first holiday in Crete 😊

Show more Show less

Jean United Kingdom


Raw scraped search results for Crete hotel listings on booking.com

Secondly, we identified an additional problem while using Reranker with its predefined `top_n` of 5 results — it turns out the scraped page contained _more_ than five relevant results - we could have addressed this by actually checking the relevancy score of each result, instead of taking just the top five (or however many) results. However, the ideal reranking configuration varies across tasks. A better way to handle this problem would simply be to use the entire scraped page - which sadly isn’t possible due to R1’s limited context length.

### [](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#overall-performance-and-potential-improvements "Overall Performance and Potential Improvements")Overall Performance and Potential Improvements

The model started well initially, but we noticed it rarely attempted to switch strategies or develop complex plans unless specifically prompted to do so. While R1 naturally employs these approaches for math and coding problems (areas it was specifically trained on), it doesn't apply the same reasoning to search tasks. While we could further fine-tune the prompt (or even use multiple prompts) to address this limitation, that wasn't our primary goal.

We also observed that R1 didn't adequately address time-sensitive information. In short, if search results don't explicitly mention an incorrect date, the model assumes the information is valid without further verification. For example, when planning a May 1 flight:

*   Germany to Crete $80 May 1: **Correct** - The model can trust this information.
*   Germany to Crete $80 January 1: **Incorrect** - The model properly identifies and discards this.
*   Germany to Crete $80: **False positive** - When no date is specified, the model fails to verify the information and incorrectly assumes validity.

If we were to continue with this project, we might look at implementing several potential improvements:

*   Tracking memory block counts and prompting the model to **summarize entries** when the state becomes too large.
*   Instructing the model to **exhaust all leads** before finalizing exploration and responding to queries.
*   Emphasizing **verification of time-sensitive information**.
*   Ensuring the model **double-checks results** by scraping URLs returned by the search tool.
*   Testing our system with **future reasoning models supporting larger context windows**, though this would require substantial refactoring and testing to adapt the prompt for a different model.

[](https://jina.ai/news/using-deepseek-r1-reasoning-model-in-deepsearch/#conclusion "Conclusion")Conclusion
-----------------------------------------------------------------------------------------------------------

Even since R1's quite recent release, the landscape has evolved significantly. Projects have emerged that train reasoning models at remarkably low costs—some for as little as $5. This democratization means that training specialized models is more accessible than ever before. Our experiments with R1 provide a useful baseline as we continue to explore how reasoning-focused LLMs can be enhanced with tools to tackle complex search tasks.

While our holiday planning example demonstrated promising results (especially for a quick demo project), it also revealed R1’s limits in handling search and memory tasks compared to its strengths in mathematics and coding. While the system successfully produced a travel plan within budget constraints, it fell short in areas like verifying time-sensitive information and thoroughly exploring all available options, highlighting the gap between the model's training focus and its application to different domains.

```