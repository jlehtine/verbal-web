# Verbal Web

Verbal web control using large language models

# Configuration

The configuration object specified for 'initVerbalWeb' can contain the following
properties.

- 'backendURL'  
  Backend URL as a string.

- 'pageContentSelector'  
  CSS selector string which specifies which elements of the web page are sent to
  the AI model.  
  Example: `pageContentSelector: "h1, p"` will send all of the \<h1> and \<p>
  elements.  
  Default value: `"h1, h2, p"`

- 'initialInstruction'  
  String which contains a system instruction given to the AI model before user
  messages. Page content will be added to the end of this string.  
   Example: You can use this to give instructions to the AI on how to use the page
  content.  
   `initialInstruction: "Use the following HTML to answer the user questions: "`  
   The AI will receive instruction: "Use the following HTML to answer the user questions:
  "\<page content as a string>  
  Default value: `"Answer the user questions and requests based on the following HTML information:\n\n"`

- 'useModel'  
  String which specifies which OpenAI model to use in the chat completion.
  Example: `useModel: "gpt-3.5-turbo"`  
  Default value: `"gpt-4"`

# Environment variables

Verbal Web uses the following environment valiables.

- 'OPENAI_API_KEY' (REQUIRED)  
  Secret API key that the OpenAI API uses for authentication.

- 'VW_ALLOW_ORIGIN' (OPTIONAL)  
  Variable specifies an address where requests to the server are allowed. Can be
  used to restrict backend requests to a specific website. If the variable
  exits, its value is used as Access-Control-Allow-Origin header.

  If the variable doesn't exist a default value of '\*' is used which allows
  requests from any address.

- 'VW_INITIAL_INSTRUCTION' (OPTIONAL)  
  If this variable exists, the initial instruction specified in the
  configuration object (see above) is overridden and replaced by this value.
  Used if backend needs to more strictly limit what kind of queries can be sent
  to the chat completion API.

- 'VW_PAGE_CONTENT' (OPTIONAL)  
  If this variable exitsts, the page content sent to the backend is overridden
  and replaced by this value. Used if backend needs to override the content
  included in the query before it is sent to the chat completion API.
