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
